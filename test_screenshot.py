
from playwright.sync_api import sync_playwright
import time
import subprocess
import json
import threading

def run_vite():
    return subprocess.Popen(["npm.cmd", "run", "dev"], cwd="artifacts/smit-csc-info", shell=True)

with sync_playwright() as p:
    print("Starting dev server...")
    server = run_vite()
    time.sleep(8)
    
    print("Launching browser...")
    browser = p.chromium.launch(headless=True)
    
    cases = [
        ("short", "Hello! How can I help you today?"),
        ("whatsapp", "Please join our group: https://chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh"),
        ("long", "Hello!\nHere are some helpful links for your reference:\n1. https://example.com/some/long/path?that=might&wrap=wrongly\n2. https://chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh\nEnjoy the resources!")
    ]
    
    for size in ["mobile", "desktop"]:
        print(f"Testing {size}...")
        context = browser.new_context(
            viewport={"width": 375, "height": 812} if size == "mobile" else {"width": 1280, "height": 720}
        )
        page = context.new_page()
        
        current_reply = "test"
        
        def handle_route(route):
            if "/api/user/status" in route.request.url:
                route.fulfill(status=200, content_type="application/json", body=json.dumps({"is_prime": True}))
            elif "/api/sahayak/chat" in route.request.url:
                route.fulfill(status=200, content_type="application/json", body=json.dumps({"reply": current_reply}))
            else:
                route.continue_()
                
        page.route("**/*", handle_route)
        
        page.goto("http://localhost:5173")
        time.sleep(2)
        
        # open widget
        btn = page.locator("button", has_text="Smit AI Sahayak").first
        if btn.is_visible():
            btn.click()
            time.sleep(1)
            
        for name, text in cases:
            current_reply = text
            page.locator("input[type=\"text\"]").fill(name)
            page.locator("button[aria-label=\"Send\"]").click()
            time.sleep(2) # wait for reply to render
            page.screenshot(path=f"screenshot-test/{name}-{size}.png")
            
        context.close()
        
    browser.close()
    server.kill()

