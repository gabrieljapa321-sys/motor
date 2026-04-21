from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path


USER_AGENT = "motor-market-tape/1.0 (+https://github.com/gabrieljapa321-sys/motorv2)"
BRAPI_QUOTE_URL = "https://brapi.dev/api/quote/{tickers}"
COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=brl&include_24hr_change=true"
AWESOMEAPI_USD_BRL_URL = "https://economia.awesomeapi.com.br/json/last/USD-BRL"

FREE_BRAPI_SYMBOLS = [
    ("PETR4", "PETR4"),
    ("MGLU3", "MGLU3"),
    ("VALE3", "VALE3"),
    ("ITUB4", "ITUB4"),
]

PREMIUM_BRAPI_SYMBOLS = [
    ("ABEV3", "ABEV3"),
    ("GGBR4", "GGBR4"),
    ("IFIX", "IFIX"),
    ("BOVA11", "Ibovespa"),
]

FALLBACK_ITEMS = [
    {"id": "bitcoin", "symbol": "BTC", "label": "Bitcoin", "price": 377962.00, "displayPrice": "R$377.962,00", "changePercent": 0.50, "currency": "BRL", "decimals": 2, "href": "https://www.coingecko.com/pt/moedas/bitcoin", "source": "CoinGecko"},
    {"id": "ifix", "symbol": "IFIX", "label": "IFIX", "price": 3941, "displayPrice": "3.941 pts", "changePercent": 0.27, "currency": "PTS", "decimals": 0, "href": "https://www.b3.com.br/pt_br/market-data-e-indices/indices/indices-amplos/indice-ifix-ifix-estatisticas-historicas.htm", "source": "B3"},
    {"id": "mglu3", "symbol": "MGLU3", "label": "MGLU3", "price": 9.35, "displayPrice": "R$9,35", "changePercent": 0.65, "currency": "BRL", "decimals": 2, "href": "https://brapi.dev/quote/MGLU3", "source": "brapi"},
    {"id": "petr4", "symbol": "PETR4", "label": "PETR4", "price": 47.02, "displayPrice": "R$47,02", "changePercent": 1.73, "currency": "BRL", "decimals": 2, "href": "https://brapi.dev/quote/PETR4", "source": "brapi"},
    {"id": "vale3", "symbol": "VALE3", "label": "VALE3", "price": 88.73, "displayPrice": "R$88,73", "changePercent": -1.14, "currency": "BRL", "decimals": 2, "href": "https://brapi.dev/quote/VALE3", "source": "brapi"},
    {"id": "itub4", "symbol": "ITUB4", "label": "ITUB4", "price": 46.37, "displayPrice": "R$46,37", "changePercent": -0.92, "currency": "BRL", "decimals": 2, "href": "https://brapi.dev/quote/ITUB4", "source": "brapi"},
    {"id": "usd-brl", "symbol": "USD-BRL", "label": "Dólar", "price": 4.98, "displayPrice": "R$4,98", "changePercent": 0.30, "currency": "BRL", "decimals": 2, "href": "https://economia.awesomeapi.com.br/json/last/USD-BRL", "source": "AwesomeAPI"},
]


def fetch_json(url: str, *, headers: dict[str, str] | None = None) -> dict[str, object]:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, **(headers or {})},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def format_brl(value: float, decimals: int = 2) -> str:
    integer_part, _, decimal_part = f"{value:.{decimals}f}".partition(".")
    chunks: list[str] = []
    while integer_part:
        chunks.insert(0, integer_part[-3:])
        integer_part = integer_part[:-3]
    formatted_integer = ".".join(chunks)
    if decimals == 0:
        return f"{formatted_integer} pts"
    return f"R${formatted_integer},{decimal_part}"


def build_brapi_item(result: dict[str, object], label_override: str | None = None) -> dict[str, object]:
    symbol = str(result.get("symbol") or "").upper()
    price = float(result.get("regularMarketPrice") or 0)
    change_percent = float(result.get("regularMarketChangePercent") or 0)
    short_name = str(result.get("shortName") or symbol)
    return {
        "id": symbol.lower(),
        "symbol": symbol,
        "label": label_override or symbol,
        "price": price,
        "displayPrice": format_brl(price, 2),
        "changePercent": round(change_percent, 2),
        "currency": "BRL",
        "decimals": 2,
        "href": f"https://brapi.dev/quote/{urllib.parse.quote(symbol)}",
        "source": "brapi",
        "name": short_name,
    }


def fetch_brapi_quotes(symbols: list[tuple[str, str]], token: str | None = None) -> list[dict[str, object]]:
    if not symbols:
      return []
    joined = ",".join(symbol for symbol, _ in symbols)
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    data = fetch_json(BRAPI_QUOTE_URL.format(tickers=joined), headers=headers)
    results = data.get("results") or []
    label_map = {symbol: label for symbol, label in symbols}
    return [build_brapi_item(result, label_map.get(str(result.get("symbol") or "").upper())) for result in results if result.get("symbol")]


def fetch_bitcoin_item() -> dict[str, object]:
    payload = fetch_json(COINGECKO_URL)
    bitcoin = payload["bitcoin"]
    price = float(bitcoin["brl"])
    change = float(bitcoin.get("brl_24h_change") or 0)
    return {
        "id": "bitcoin",
        "symbol": "BTC",
        "label": "Bitcoin",
        "price": price,
        "displayPrice": format_brl(price, 2),
        "changePercent": round(change, 2),
        "currency": "BRL",
        "decimals": 2,
        "href": "https://www.coingecko.com/pt/moedas/bitcoin",
        "source": "CoinGecko",
    }


def fetch_usd_brl_item() -> dict[str, object]:
    payload = fetch_json(AWESOMEAPI_USD_BRL_URL)
    quote = payload["USDBRL"]
    price = float(quote["bid"])
    change = float(quote.get("pctChange") or 0)
    return {
        "id": "usd-brl",
        "symbol": "USD-BRL",
        "label": "Dólar",
        "price": price,
        "displayPrice": format_brl(price, 2),
        "changePercent": round(change, 2),
        "currency": "BRL",
        "decimals": 2,
        "href": "https://economia.awesomeapi.com.br/json/last/USD-BRL",
        "source": "AwesomeAPI",
    }


def load_previous_items(output_path: Path) -> list[dict[str, object]]:
    if not output_path.exists():
        return FALLBACK_ITEMS
    try:
        payload = json.loads(output_path.read_text(encoding="utf-8"))
        items = payload.get("items")
        if isinstance(items, list) and items:
            return items
    except Exception:
        return FALLBACK_ITEMS
    return FALLBACK_ITEMS


def build_payload(output_path: Path) -> dict[str, object]:
    token = os.getenv("BRAPI_TOKEN")
    previous_items = {str(item["id"]): item for item in load_previous_items(output_path)}
    next_items: list[dict[str, object]] = []
    warnings: list[str] = []

    try:
        next_items.extend(fetch_brapi_quotes(FREE_BRAPI_SYMBOLS))
    except Exception as error:
        warnings.append(f"[ticker] falha nas cotacoes gratis da brapi: {error}")

    if token:
        try:
            next_items.extend(fetch_brapi_quotes(PREMIUM_BRAPI_SYMBOLS, token=token))
        except Exception as error:
            warnings.append(f"[ticker] falha nas cotacoes premium da brapi: {error}")

    for fetcher in (fetch_bitcoin_item, fetch_usd_brl_item):
        try:
            next_items.append(fetcher())
        except Exception as error:
            warnings.append(f"[ticker] falha em fonte externa: {error}")

    merged: dict[str, dict[str, object]] = {str(item["id"]): item for item in next_items}

    desired_ids = [
        "bitcoin",
        "ifix",
        "mglu3",
        "petr4",
        "vale3",
        "itub4",
        "abev3",
        "ggbr4",
        "bova11",
        "usd-brl",
    ]
    final_items: list[dict[str, object]] = []
    for item_id in desired_ids:
        if item_id in merged:
            final_items.append(merged[item_id])
        elif item_id in previous_items:
            final_items.append(previous_items[item_id])

    if not final_items:
        final_items = FALLBACK_ITEMS

    if warnings:
        print("\n".join(warnings), file=sys.stderr)

    now_iso = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return {
        "updatedAt": now_iso,
        "items": final_items,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Atualiza a faixa de ticker do Motor.")
    parser.add_argument("--output", default="assets/data/ticker-tape.json", help="Caminho do arquivo de saida.")
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = build_payload(output_path)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[ticker] faixa atualizada em {output_path} com {len(payload['items'])} itens.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
