import pathlib
import re
import unittest
import json

import esprima


ROOT = pathlib.Path(__file__).resolve().parents[1]
INDEX_HTML = ROOT / "index.html"
JS_DIR = ROOT / "assets" / "js"
CSS_DIR = ROOT / "assets" / "css"
DATA_DIR = ROOT / "assets" / "data"
MANIFEST = ROOT / "manifest.webmanifest"
SERVICE_WORKER = ROOT / "service-worker.js"


class StaticValidationTests(unittest.TestCase):
    def test_index_has_no_inline_handlers(self):
        html = INDEX_HTML.read_text(encoding="utf-8")
        self.assertIsNone(
            re.search(r"on(click|change|submit|input|keydown)\s*=", html),
            "index.html não deve conter handlers inline",
        )

    def test_accessibility_status_regions_exist(self):
        html = INDEX_HTML.read_text(encoding="utf-8")
        self.assertIn('id="toast" role="status" aria-live="polite"', html)
        self.assertIn('id="authSyncStatus" class="auth-panel-sync" role="status" aria-live="polite"', html)
        self.assertIn('aria-keyshortcuts="Alt+ArrowLeft"', html)
        self.assertIn('aria-keyshortcuts="Alt+ArrowRight"', html)

    def test_script_order_includes_new_architecture_layers(self):
        html = INDEX_HTML.read_text(encoding="utf-8")
        order = [
            "assets/js/store.js",
            "assets/js/dates.js",
            "assets/js/theme.js",
            "assets/js/backup.js",
            "assets/js/sync-service.js",
            "assets/js/app-core.js",
            "assets/js/app-pages.js",
            "assets/js/firebase-init.js",
            "assets/js/auth-panel.js",
            "assets/js/firebase-sync.js",
        ]
        positions = [html.index(path) for path in order]
        self.assertEqual(positions, sorted(positions))

    def test_app_css_imports_domain_files(self):
        css = (CSS_DIR / "app.css").read_text(encoding="utf-8")
        for name in ["base.css", "dashboard.css", "calendar.css", "grades.css", "week.css", "flashcards.css"]:
            self.assertIn(name, css)

    def test_json_data_files_exist_and_are_valid(self):
        for name in ["study-data.json", "ui-config.json"]:
            payload = json.loads((DATA_DIR / name).read_text(encoding="utf-8"))
            self.assertIsInstance(payload, dict)

    def test_manifest_and_service_worker_exist(self):
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(manifest["start_url"], "./")
        self.assertIn("icons", manifest)
        esprima.parseScript(SERVICE_WORKER.read_text(encoding="utf-8"), {"tolerant": False})

    def test_all_js_files_parse(self):
        for path in sorted(JS_DIR.glob("*.js")):
            code = path.read_text(encoding="utf-8")
            if path.name == "firebase-init.js" or "import " in code or "export " in code:
                esprima.parseModule(code, {"tolerant": False})
            else:
                esprima.parseScript(code, {"tolerant": False})


if __name__ == "__main__":
    unittest.main()
