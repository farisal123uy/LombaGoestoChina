import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();

await page.goto('http://localhost:3000');
await page.screenshot({ path: '/tmp/landing.png', fullPage: true });

await page.goto('http://localhost:3000/evidence');
await page.screenshot({ path: '/tmp/evidence.png', fullPage: true });

await page.goto('http://localhost:3000/dashboard');
await page.screenshot({ path: '/tmp/dashboard.png', fullPage: true });

await page.goto('http://localhost:3000/setup');
await page.screenshot({ path: '/tmp/setup.png', fullPage: true });

await browser.close();
console.log('Screenshots saved to /tmp/');
