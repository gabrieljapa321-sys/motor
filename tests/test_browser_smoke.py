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
            raise unittest.SkipTest("Playwright nao esta disponivel.")

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
            raise RuntimeError("Servidor local nao respondeu a tempo.")

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
        self.page.wait_for_selector(".tb-nav-btn[data-nav-page='home']")
        self.page.wait_for_timeout(800)
        self.assertFalse(self.page_errors, f"Erros de runtime: {self.page_errors}")

    def _open_studies_section(self, section):
        self.page.click(".tb-nav-btn[data-nav-page='studies']")
        self.page.wait_for_selector("#studyNavBar")
        self.page.click(f".study-nav-btn[data-study-page='{section}']")
        self.page.wait_for_timeout(250)

    def test_primary_and_study_navigation_visibility(self):
        self._goto()
        for target, selector in [("home", "#homePage"), ("studies", "#dashboardPage"), ("news", "#newsPage"), ("work", "#workPage")]:
            self.page.click(f".tb-nav-btn[data-nav-page='{target}']")
            self.page.wait_for_timeout(250)
            self.assertTrue(self.page.locator(selector).is_visible(), f"{selector} deveria estar visivel")
        self.page.click(".tb-nav-btn[data-nav-page='studies']")
        for target, selector in [("week", "#weekPage"), ("fc", "#fcPage"), ("calendar", "#calendarPage"), ("grades", "#gradesPage"), ("dashboard", "#dashboardPage")]:
            self.page.click(f".study-nav-btn[data-study-page='{target}']")
            self.page.wait_for_timeout(250)
            self.assertTrue(self.page.locator(selector).is_visible(), f"{selector} deveria estar visivel")
        self.assertFalse(self.page_errors, f"Erros de runtime: {self.page_errors}")

    def test_calendar_legend_toggle(self):
        self._goto()
        self._open_studies_section("calendar")
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
        self._open_studies_section("dashboard")
        toggle = self.page.locator("[data-action='toggle-dashboard-focus']").first
        toggle.click()
        self.page.wait_for_timeout(150)
        self.assertEqual(self.page.locator("#dashboardPage").get_attribute("data-focus-mode"), "true")

    def test_grades_search_filter(self):
        self._goto()
        self._open_studies_section("grades")
        self.page.wait_for_selector("#gradeNotesSearchInput")
        self.page.fill("#gradeNotesSearchInput", "P1")
        self.page.wait_for_timeout(250)
        self.assertTrue(self.page.locator(".grade-filter-hint").is_visible())

    def test_flashcards_exercises_viewer(self):
        self._goto()
        self._open_studies_section("fc")
        self.page.wait_for_selector("#fcSubviewToggle")
        self.page.click("#fcSubviewToggle [data-fc-view='exercises']")
        self.page.wait_for_timeout(250)
        self.assertTrue(self.page.locator("#fcExercisesAside").is_visible())
        self.assertGreater(self.page.locator("#fcExerciseList [data-exercise-id]").count(), 0)
        self.page.locator("#fcExerciseList [data-exercise-id]").first.click()
        self.page.wait_for_timeout(200)
        self.assertTrue(self.page.locator("#fcStudyPanel").get_by_text("Enunciado", exact=True).is_visible())
        hint_button = self.page.locator("#fcStudyPanel [data-exercise-action='reveal-hint']").first
        hint_button.click()
        self.page.wait_for_timeout(150)
        self.assertTrue(self.page.locator("#fcStudyPanel").get_by_text("Pistas liberadas").is_visible())
        self.assertFalse(self.page_errors, f"Erros de runtime: {self.page_errors}")

    def test_news_feed_page_loads_items_and_updates_inbox(self):
        self._goto()
        self.page.click(".tb-nav-btn[data-nav-page='news']")
        self.page.wait_for_selector("#newsPage")
        self.page.wait_for_selector("#newsFeedList .news-item-card")
        self.assertGreater(self.page.locator("#newsFeedList .news-item-card").count(), 0)
        self.assertTrue(self.page.locator("#newsInboxCard").get_by_text("Caixa de entrada").is_visible())
        self.assertFalse(self.page_errors, f"Erros de runtime: {self.page_errors}")

    def test_news_refresh_button_runs_manual_update(self):
        self._goto()
        self.page.click(".tb-nav-btn[data-nav-page='news']")
        self.page.wait_for_selector("#newsRefreshBtn")
        self.page.locator("#newsRefreshBtn").click()
        self.page.wait_for_timeout(400)
        self.page.wait_for_function(
            "() => document.querySelector('#newsRefreshBtn') && document.querySelector('#newsRefreshBtn').textContent.includes('Atualizar agora')",
            timeout=10000,
        )
        self.assertFalse(self.page_errors, f"Erros de runtime: {self.page_errors}")

    def test_news_page_persists_on_refresh_via_hash_route(self):
        self._goto()
        self.page.click(".tb-nav-btn[data-nav-page='news']")
        self.page.wait_for_timeout(300)
        self.assertIn("#news", self.page.url)
        self.page.reload(wait_until="domcontentloaded")
        self.page.wait_for_timeout(500)
        self.assertTrue(self.page.locator("#newsPage").is_visible())
        self.assertFalse(self.page.locator("#homePage").is_visible())
        self.assertIn("#news", self.page.url)
        self.assertFalse(self.page_errors, f"Erros de runtime: {self.page_errors}")

    def test_ticker_tape_loads_visible_items(self):
        self._goto()
        self.page.wait_for_selector("#tickerTapeShell:not([hidden])")
        self.page.wait_for_selector("#tickerTapeTrack .ticker-tape-item")
        self.assertGreater(self.page.locator("#tickerTapeTrack .ticker-tape-item").count(), 0)
        self.assertFalse(self.page_errors, f"Erros de runtime: {self.page_errors}")

    def test_work_task_flow_company_filter_waiting_done_and_persistence(self):
        self._goto()
        self.page.click(".tb-nav-btn[data-nav-page='work']")
        self.page.wait_for_selector("#workPage")
        self.page.fill("#workTaskTitle", "Revisar indicadores BENEVA")
        self.page.fill("#workTaskNextAction", "Solicitar atualizacao do caixa")
        self.page.select_option("#workTaskScope", "company")
        self.page.select_option("#workTaskCompany", "beneva")
        first_day = self.page.eval_on_selector("#workTaskDay", "select => Array.from(select.options).find(option => option.value).value")
        self.page.select_option("#workTaskDay", first_day)
        self.page.select_option("#workTaskPriority", "high")
        self.page.select_option("#workTaskArea", "financeiro")
        self.page.click("#workTaskForm button[type='submit']")
        self.page.wait_for_selector(".work-task:has-text('Revisar indicadores BENEVA')")
        self.assertTrue(self.page.locator(".work-task:has-text('BENEVA')").first.is_visible())
        self.page.click(".work-filter-btn[data-work-filter='beneva']")
        self.page.wait_for_timeout(200)
        self.assertTrue(self.page.locator(".work-task:has-text('Revisar indicadores BENEVA')").first.is_visible())
        self.page.click(".work-task:has-text('Revisar indicadores BENEVA') [data-work-status='waiting']")
        self.page.wait_for_timeout(250)
        self.assertTrue(self.page.locator("#workWaitingList .work-task:has-text('Revisar indicadores BENEVA')").first.is_visible())
        self.page.locator("#workWaitingList .work-task:has-text('Revisar indicadores BENEVA') .work-task-check").first.click()
        self.page.wait_for_timeout(250)
        self.assertEqual(self.page.locator(".work-task:has-text('Revisar indicadores BENEVA')").count(), 0)
        self.page.reload(wait_until="domcontentloaded")
        self.page.wait_for_selector(".tb-nav-btn[data-nav-page='work']")
        self.page.click(".tb-nav-btn[data-nav-page='work']")
        self.page.wait_for_timeout(400)
        done_count = self.page.evaluate("() => JSON.parse(localStorage.getItem('poli-study-motor-v1')).workTasks.filter(t => t.title === 'Revisar indicadores BENEVA' && t.status === 'done').length")
        self.assertEqual(done_count, 1)
        self.assertFalse(self.page_errors, f"Erros de runtime: {self.page_errors}")


if __name__ == "__main__":
    unittest.main()
