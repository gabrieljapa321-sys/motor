from __future__ import annotations

import argparse
import datetime as dt
import email.utils
import hashlib
import html
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path


RSS_ROOT = "https://news.google.com/rss/search"
GOOGLE_NEWS_ARTICLE_ROOT = "https://news.google.com/articles"
GOOGLE_BATCH_EXECUTE_URL = "https://news.google.com/_/DotsSplashUi/data/batchexecute"
USER_AGENT = "motor-news-bot/1.0 (+https://github.com/gabrieljapa321-sys/motorv2)"
MAX_ITEMS_PER_CATEGORY = 18
MAX_ITEMS_TOTAL = 64
MAX_METADATA_ITEMS = 28
DECODE_BATCH_SIZE = 10
BLOCKED_SOURCE_DOMAINS = {
    "instagram.com",
    "youtube.com",
    "tiktok.com",
    "facebook.com",
    "linkedin.com",
}
PREMIUM_SOURCE_PATTERNS = (
    "valor.globo.com",
    "valorinveste.globo.com",
)
QUERY_DEFINITIONS = [
    {
        "id": "latest",
        "label": "Ultima hora",
        "query": 'mercado financeiro OR ibovespa OR dolar OR juros when:1d',
        "tags": ["mercado", "bolsa", "macro"],
    },
    {
        "id": "funds",
        "label": "Fundos",
        "query": '"fundos de investimento" OR "fundo imobiliario" OR asset when:2d',
        "tags": ["fundos", "asset", "fiis"],
    },
    {
        "id": "companies",
        "label": "Empresas",
        "query": 'empresas brasileiras OR balanco OR guidance OR fusao when:2d',
        "tags": ["empresas", "resultados", "m&a"],
    },
    {
        "id": "macro",
        "label": "Macro",
        "query": 'inflacao OR fiscal OR selic OR fed OR pib when:2d',
        "tags": ["macro", "juros", "inflacao"],
    },
]
META_IMAGE_KEYS = ("og:image", "twitter:image", "image", "og:image:url")
META_DESCRIPTION_KEYS = ("og:description", "twitter:description", "description")
META_SITE_KEYS = ("og:site_name", "application-name")


def build_feed_url(query: str) -> str:
    params = {
        "q": query,
        "hl": "pt-BR",
        "gl": "BR",
        "ceid": "BR:pt-419",
    }
    return f"{RSS_ROOT}?{urllib.parse.urlencode(params)}"


def collapse_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def strip_html(value: str) -> str:
    return collapse_spaces(html.unescape(re.sub(r"<[^>]+>", " ", value or "")))


def normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", collapse_spaces(value).lower()).strip("-")


def parse_date(value: str | None) -> str | None:
    if not value:
        return None
    try:
        parsed = email.utils.parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def remove_source_suffix(title: str, source: str) -> str:
    clean_title = collapse_spaces(title)
    clean_source = collapse_spaces(source)
    suffix = f" - {clean_source}"
    if clean_source and clean_title.endswith(suffix):
        return clean_title[: -len(suffix)].rstrip(" -")
    return clean_title


def build_summary(title: str, source: str, description: str, category_label: str) -> str:
    summary = strip_html(description)
    if title:
        summary = summary.replace(collapse_spaces(title), "", 1).strip(" -")
    if source:
        summary = summary.replace(collapse_spaces(source), "", 1).strip(" -")
    summary = collapse_spaces(summary)
    if summary:
        return summary[:280]
    return f"Atualizacao de {category_label.lower()} capturada em {source or 'fonte externa'}."


def is_blocked_source(source_url: str, source_name: str) -> bool:
    haystack = f"{source_url} {source_name}".lower()
    return any(domain in haystack for domain in BLOCKED_SOURCE_DOMAINS)


def is_premium_source(source_url: str, source_name: str) -> bool:
    haystack = f"{source_url} {source_name}".lower()
    return any(pattern in haystack for pattern in PREMIUM_SOURCE_PATTERNS)


def fetch_bytes(url: str, *, timeout: int = 30, headers: dict[str, str] | None = None, data: bytes | None = None) -> bytes:
    request_headers = {"User-Agent": USER_AGENT, **(headers or {})}
    request = urllib.request.Request(url, headers=request_headers, data=data)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def fetch_html(url: str, *, timeout: int = 15) -> tuple[str, str]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        content_type = response.headers.get_content_charset() or "utf-8"
        raw = response.read()
        try:
            text = raw.decode(content_type, errors="ignore")
        except LookupError:
            text = raw.decode("utf-8", errors="ignore")
        return text, response.geturl()


def fetch_rss(url: str) -> bytes:
    return fetch_bytes(url, timeout=30)


def extract_google_article_id(url: str) -> str | None:
    match = re.search(r"/(?:rss/)?articles/([^?/#]+)", url) or re.search(r"/read/([^?/#]+)", url)
    if not match:
        return None
    return match.group(1)


def parse_google_decoding_params(article_id: str) -> dict[str, str] | None:
    html_text, _ = fetch_html(f"{GOOGLE_NEWS_ARTICLE_ROOT}/{article_id}", timeout=20)
    signature_match = re.search(r'data-n-a-sg="([^"]+)"', html_text)
    timestamp_match = re.search(r'data-n-a-ts="([^"]+)"', html_text)
    if not signature_match or not timestamp_match:
        return None
    return {
        "gn_art_id": article_id,
        "signature": html.unescape(signature_match.group(1)),
        "timestamp": timestamp_match.group(1),
    }


def decode_google_news_urls(items: list[dict[str, object]]) -> dict[str, str]:
    decode_params: list[dict[str, str]] = []
    for item in items:
        article_id = extract_google_article_id(str(item.get("url", "")))
        if not article_id:
            continue
        try:
            params = parse_google_decoding_params(article_id)
        except Exception:
            continue
        if params:
            decode_params.append(params)

    decoded_urls: dict[str, str] = {}
    for index in range(0, len(decode_params), DECODE_BATCH_SIZE):
        chunk = decode_params[index:index + DECODE_BATCH_SIZE]
        articles_reqs = [
            [
                "Fbv4je",
                f'["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"{entry["gn_art_id"]}",{entry["timestamp"]},"{entry["signature"]}"]',
            ]
            for entry in chunk
        ]
        payload = f"f.req={urllib.parse.quote(json.dumps([articles_reqs]), safe='')}".encode("utf-8")
        response_text = fetch_bytes(
            GOOGLE_BATCH_EXECUTE_URL,
            timeout=25,
            headers={"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"},
            data=payload,
        ).decode("utf-8", errors="ignore")
        batch_body = response_text.split("\n\n", 1)[1]
        parsed = json.loads(batch_body)
        decoded_chunk: list[str] = []
        for row in parsed:
            if not isinstance(row, list) or len(row) < 3 or not row[2]:
                continue
            try:
                decoded_chunk.append(json.loads(row[2])[1])
            except Exception:
                continue
        for entry, decoded_url in zip(chunk, decoded_chunk):
            if decoded_url and decoded_url.startswith("http"):
                decoded_urls[entry["gn_art_id"]] = decoded_url
    return decoded_urls


def extract_meta_content(html_text: str, keys: tuple[str, ...]) -> str | None:
    meta_tags = re.findall(r"<meta\b[^>]*>", html_text, flags=re.IGNORECASE)
    lowered_keys = {key.lower() for key in keys}
    for tag in meta_tags:
        name_match = re.search(r'(?:property|name|itemprop)\s*=\s*["\']([^"\']+)["\']', tag, flags=re.IGNORECASE)
        content_match = re.search(r'content\s*=\s*["\']([^"\']+)["\']', tag, flags=re.IGNORECASE)
        if not name_match or not content_match:
            continue
        if name_match.group(1).strip().lower() in lowered_keys:
            return html.unescape(content_match.group(1).strip())
    return None


def is_generic_summary(value: str) -> bool:
    lowered = collapse_spaces(value).lower()
    return not lowered or lowered.startswith("atualizacao de ")


def enrich_item_metadata(item: dict[str, object]) -> dict[str, object]:
    article_url = str(item.get("url") or "")
    if not article_url.startswith("http"):
        return item
    try:
        html_text, final_url = fetch_html(article_url, timeout=15)
    except Exception:
        return item

    image_url = extract_meta_content(html_text, META_IMAGE_KEYS)
    if image_url:
        image_url = urllib.parse.urljoin(final_url, image_url)

    description = extract_meta_content(html_text, META_DESCRIPTION_KEYS)
    site_name = extract_meta_content(html_text, META_SITE_KEYS)
    if description:
        description = collapse_spaces(description)[:320]

    enriched = dict(item)
    enriched["url"] = final_url
    if image_url:
        enriched["imageUrl"] = image_url
    if description:
        enriched["details"] = description
        if is_generic_summary(str(item.get("summary", ""))):
            enriched["summary"] = description[:280]
    if site_name and not str(item.get("source", "")).strip():
        enriched["source"] = site_name
    return enriched


def extract_items(definition: dict[str, object]) -> list[dict[str, object]]:
    category_id = str(definition["id"])
    category_label = str(definition["label"])
    base_tags = list(definition.get("tags", []))
    xml_bytes = fetch_rss(build_feed_url(str(definition["query"])))
    root = ET.fromstring(xml_bytes)
    items: list[dict[str, object]] = []

    for item in root.findall("./channel/item"):
        title = collapse_spaces(item.findtext("title") or "")
        link = collapse_spaces(item.findtext("link") or "")
        source_element = item.find("source")
        source_name = collapse_spaces(source_element.text or "") if source_element is not None else ""
        source_url = collapse_spaces(source_element.attrib.get("url", "")) if source_element is not None else ""
        if is_blocked_source(source_url, source_name) or not title or not link:
            continue

        title = remove_source_suffix(title, source_name)
        published_at = parse_date(item.findtext("pubDate")) or dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        digest = hashlib.sha1(f"{category_id}|{source_name}|{title}|{published_at}".encode("utf-8")).hexdigest()[:24]
        items.append(
            {
                "id": f"{category_id}-{digest}",
                "title": title,
                "summary": build_summary(title, source_name, item.findtext("description") or "", category_label),
                "details": "",
                "url": link,
                "source": source_name or "Fonte",
                "category": category_id,
                "tags": base_tags[:4],
                "publishedAt": published_at,
                "updatedAt": published_at,
                "premium": is_premium_source(source_url, source_name),
                "sourceQuery": str(definition["query"]),
            }
        )

    items.sort(key=lambda entry: entry["publishedAt"], reverse=True)
    return items[:MAX_ITEMS_PER_CATEGORY]


def dedupe_items(items: list[dict[str, object]]) -> list[dict[str, object]]:
    seen: set[str] = set()
    output: list[dict[str, object]] = []
    for item in sorted(items, key=lambda entry: entry["publishedAt"], reverse=True):
        signature = normalize_key(f"{item['title']}|{item['source']}")
        if not signature or signature in seen:
            continue
        seen.add(signature)
        output.append(item)
        if len(output) >= MAX_ITEMS_TOTAL:
            break
    return output


def enrich_items(items: list[dict[str, object]]) -> list[dict[str, object]]:
    decoded_urls = decode_google_news_urls(items[:MAX_METADATA_ITEMS])
    enriched_items: list[dict[str, object]] = []
    for index, item in enumerate(items):
        article_id = extract_google_article_id(str(item.get("url", "")))
        enriched = dict(item)
        if article_id and article_id in decoded_urls:
            enriched["url"] = decoded_urls[article_id]
        if index < MAX_METADATA_ITEMS:
            enriched = enrich_item_metadata(enriched)
        enriched_items.append(enriched)
    return enriched_items


def build_payload() -> dict[str, object]:
    items: list[dict[str, object]] = []
    warnings: list[str] = []
    for definition in QUERY_DEFINITIONS:
        try:
            items.extend(extract_items(definition))
        except Exception as error:  # pragma: no cover - network dependent
            warnings.append(f"[news] falha ao consultar {definition['id']}: {error}")

    if warnings:
        print("\n".join(warnings), file=sys.stderr)

    items = dedupe_items(items)
    if not items:
        raise SystemExit("Nenhuma noticia foi coletada.")

    try:
        items = enrich_items(items)
    except Exception as error:  # pragma: no cover - network dependent
        print(f"[news] falha no enriquecimento de metadados: {error}", file=sys.stderr)

    now_iso = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    sources = sorted({str(item["source"]) for item in items}, key=str.lower)
    return {
        "updatedAt": now_iso,
        "generatedAt": now_iso,
        "categories": [{"id": "all", "label": "Tudo"}]
        + [{"id": definition["id"], "label": definition["label"]} for definition in QUERY_DEFINITIONS],
        "sources": [{"id": normalize_key(source), "label": source} for source in sources],
        "items": items,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Atualiza o feed de noticias do Motor.")
    parser.add_argument("--output", default="assets/data/news.json", help="Caminho do arquivo de saida.")
    args = parser.parse_args()

    payload = build_payload()
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[news] feed atualizado em {output_path} com {len(payload['items'])} itens.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
