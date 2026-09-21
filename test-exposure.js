const http = require('http');

async function testExposure() {
  const urls = [
    'http://127.0.0.1:5000/attached_assets/documents/1-vidhava-sahay-affidavit.pdf',
    'http://127.0.0.1:5000/api/documents/1/preview',
    'http://127.0.0.1:5000/api/documents/1/download',
  ];
  
  for (const url of urls) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      console.log(`URL: ${url}`);
      console.log(`Status: ${res.status}`);
      console.log(`Response Snippet: ${text.substring(0, 100)}...\n`);
    } catch(e) {
      console.log(`URL: ${url} failed - ${e.message}\n`);
    }
  }
}
testExposure();
