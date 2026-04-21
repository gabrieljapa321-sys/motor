import pathlib
import socket
import subprocess
import sys
import time
import unittest
import urllib.request

try:
    from playwright.sync_api import sync_playwright
except Exception:  # pragma: no cover
    sync_playwright = None


ROOT = pathlib.Path(__file__).resolve().parents[1]


def _free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class BrowserSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if sync_playwright is None:
            raise unittest.SkipTest("Playwright não está disponível.")

        cls.port = _free_port()
        cls.server = subprocess.Popen(
            [sys.executable, "-m", "http.server", str(cls.port), "--bind", "127.0.0.1"],
            cwd=str(ROOT),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.STDOUT,
        )
        cls.base_url = f"http://127.0.0.1:{cls.port}/"
        deadline = time.time() + 15
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(cls.base_url, timeout=1):
                    break
            except Exception:
                time.sleep(0.2)
        else:
            cls.tearDownClass()
            raise RuntimeError("Servidor local não respondeu a tempo.")

        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        browser = getattr(cls, "browser", None)
        if browser:
            browser.close()
        playwright = getattr(cls, "playwright", None)
        if playwright:
            playwright.stop()
        server = getattr(cls, "server", None)
        if server and server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()

    def setUp(self):
        self.context = self.browser.new_context()
        self.page = self.context.new_page()
        self.page_errors = []
        self.page.on("pageerror", lambda error: self.page_errors.append(str(error)))

    def tearDown(self):
        self.page.close()
        self.context.close()

    def _goto(self):
        self.page.goto(self.base_url, wait_until="domcontentloaded")
        self.page.wait_for_selector(".tb-nav-btn[data-nav-page='dashboard']")
        self.page.wait_for_timeout(800)
        self.assertFalse(self.page_errors, f"Erros de runtime: {self.page_errors}")

    def test_tab_navigation_and_visibility(self):
        self._goto()
        for target, selector in [
            ("week", "#weekPage"),
            ("calendar", "#calendarPage"),
            ("grades", "#gradesPage"),
            ("dashboard", "#dashboardPage"),
        ]:
            self.page.click(f".tb-nav-btn[data-nav-page='{target}']")
            self.page.wait_for_timeout(200)
            self.assertTrue(self.page.locator(selector).is_visible(), f"{selector} deveria estar visível")
        self.assertFalse(self.page_errors, f"Erros de runtime: {self.page_errors}")

    def test_calendar_legend_toggle(self):
        self._goto()
        self.page.click(".tb-nav-btn[data-nav-page='calendar']")
        self.page.wait_for_timeout(200)
        toggle = self.page.locator("#calendarLegendToggleBtn")
        legend = self.page.locator("#monthLegend")
        initial_state = toggle.get_attribute("aria-pressed")
        toggle.click()
        self.page.wait_for_timeout(150)
        next_state = toggle.get_attribute("aria-pressed")
        self.assertNotEqual(initial_state, next_state)
        self.assertEqual(next_state, "true" if initial_state == "false" else "false")
        self.assertEqual(legend.is_hidden(), next_state == "false")

    def test_dashboard_focus_mode_toggle(self):
        self._goto()
        toggle = self.page.locator("[data-action='toggle-dashboard-focus']").first
        toggle.click()
        self.page.wait_for_timeout(150)
        self.assertEqual(self.page.locator("#dashboardPage").get_attribute("data-focus-mode"), "true")

    def test_grades_search_filter(self):
        self._goto()
        self.page.click(".tb-nav-btn[data-nav-page='grades']")
        self.page.wait_for_selector("#gradeNotesSearchInput")
        self.page.fill("#gradeNotesSearchInput", "P1")
        self.page.wait_for_timeout(250)
        self.assertTrue(self.page.locator(".grade-filter-hint").is_visible())


if __name__ == "__main__":
    unittest.main()
