# 📊 Instagram Analytics Monitor

A powerful, lightweight tool for tracking and analyzing Instagram profile activity. The project features a modern, dark-themed frontend and a robust Node.js proxy server that handles API communication securely.

## 🚀 Key Features
* **Real-time Analytics:** Track follower counts, engagement metrics, and profile summaries.
* **Post Insights:** View and analyze the performance of recent publications.
* **Customizable Setup:** Manage API keys easily via the browser settings (LocalStorage).
* **Proxy Architecture:** Keeps your API keys hidden from client-side exposure.

---

## 🛠 Setup & Installation

### 1. Clone the Repository
```bash
git clone https://github.com/YOUR_USERNAME/instagram-analytics.git
cd instagram-analytics
```
2. Configure Environment
Create a .env file in the root directory of the project and add your API credentials:
```bash 
PORT=5000
RAPIDAPI_KEY=your_rapidapi_key_here
```
3. Run the Server
Install the required dependencies and start the backend:
```bash 
npm install express cors axios dotenv
node server.js
```
Once the server is running, simply open index.html in your web browser.

---

⚙️ API Configuration & Variations
This project is designed to be flexible. Depending on your needs, you can switch the data provider.

Option 1: Using RapidAPI (Recommended)
Sign up on RapidAPI.

Subscribe to an Instagram API (e.g., instagram-statistics-api).
https://rapidapi.com/artemlipko/api/instagram-statistics-api

Copy your X-RapidAPI-Key and add it to your .env file.

Option 2: Custom Proxy or Private API
If you have your own backend or a different data provider:

Open server.js.

Update the API_HOST variable to point to your provider's endpoint.

Adjust the axios.get request paths and headers in the app.get routes to match your provider's documentation.

Option 3: Direct Integration (Advanced)
If you intend to use the official Graph API or libraries like instagram-private-api:

You will need to implement session handling (cookies/tokens).

Replace the axios logic in server.js with specific library methods.
Note: This approach requires careful handling to avoid account bans.

---

⚠️ Troubleshooting
CORS Errors: Ensure the Node.js server is running (node server.js) and listening on port 5000. Check your cors settings in server.js.

403 Forbidden: This usually means your API subscription is not active or the key is invalid. Double-check your subscription status on the RapidAPI dashboard.

404 Not Found: The API endpoint path has likely changed. Verify the paths in server.js against your provider's latest API documentation.
