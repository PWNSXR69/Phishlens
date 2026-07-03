# 🔍 PhishLens

**PhishLens** is a browser extension that helps protect users from phishing attacks by analyzing websites in real time. Instead of relying solely on blocklists, PhishLens actively inspects web pages for common phishing indicators and warns users before they interact with malicious content.

## ✨ Features

- 🌐 Analyze web pages as they load.
- 🔀 Detect suspicious redirects.
- 🎭 Identify lookalike domains (e.g., `paypal1.com`).
- 🔒 Inspect login and credential forms that submit data to suspicious endpoints.
- ⚠️ Flag potentially dangerous behavior before users fall victim to phishing attacks.
- 🚀 Lightweight and designed for real-time protection.

## 🛠️ How It Works

PhishLens monitors browser activity and evaluates websites using several phishing detection techniques, including:

- URL and domain analysis
- Redirect chain inspection
- Lookalike (typosquatting) domain detection
- Credential form validation
- Suspicious destination analysis
- Browser API security checks

When a website exhibits suspicious behavior, PhishLens alerts the user before sensitive information is submitted.

## 📂 Project Structure

```
phishlens/
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.js
├── styles.css
├── icons/
└── README.md
```

## 🚀 Getting Started

1. Clone the repository.

```bash
git clone https://github.com/<your-username>/phishlens.git
```

2. Open Chrome and navigate to:

```
chrome://extensions/
```

3. Enable **Developer Mode**.

4. Click **Load unpacked**.

5. Select the project folder.

PhishLens will now be installed for development.

## 🎯 Roadmap

- [ ] URL reputation analysis
- [ ] Heuristic phishing detection
- [ ] Redirect chain monitoring
- [ ] Lookalike domain detection
- [ ] Credential form inspection
- [ ] Risk scoring system
- [ ] Warning page before navigation
- [ ] User reporting system
- [ ] Safe allowlist
- [ ] Detection statistics dashboard

## 🤝 Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request to improve PhishLens.

## 📄 License

This project is licensed under the MIT License.
