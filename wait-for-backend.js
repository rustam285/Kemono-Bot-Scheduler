const http = require("http");

const URL = "http://localhost:8000/api/health";
const MAX_WAIT = 60000;
const INTERVAL = 1000;
const start = Date.now();

function check() {
  http
    .get(URL, (res) => {
      if (res.statusCode === 200) {
        console.log("[wait-for-backend] Backend is ready!");
        process.exit(0);
      }
      retry();
    })
    .on("error", retry);
}

function retry() {
  if (Date.now() - start > MAX_WAIT) {
    console.error("[wait-for-backend] Timeout waiting for backend");
    process.exit(1);
  }
  setTimeout(check, INTERVAL);
}

console.log("[wait-for-backend] Waiting for backend...");
check();
