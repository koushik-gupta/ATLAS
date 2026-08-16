from playwright.sync_api import Page, Locator

class HomePage:
    """
    Page Object Model (POM) for the ATLAS Landing Page.
    Instead of hardcoding locators in our tests, we put them all here.
    If the website changes, we only update this one file!
    """

    def __init__(self, page: Page):
        self.page = page
        self.url = "http://localhost:3000"
        
        # Locators
        # We find the button that contains the text "Start Planning"
        self.start_planning_btn: Locator = page.get_by_role("button", name="Start Planning Your Journey")
        
        # We find the global navigation logo
        self.logo: Locator = page.get_by_text("ATLAS", exact=True)

    def navigate(self):
        """Navigate to the home page."""
        self.page.goto(self.url)

    def click_start_planning(self):
        """Click the start planning button."""
        self.start_planning_btn.click()
