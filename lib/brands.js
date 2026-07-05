/**
 * brands.js
 * ---------------------------------------------------------
 * A small seed list of frequently-impersonated brands.
 * In a real product you'd pull this from a maintained feed
 * (e.g. a Tranco top-N list) — for a portfolio project,
 * a curated list is more than enough to demo the concept
 * and keeps the repo self-contained and readable.
 *
 * Keep these as bare domains (no protocol, no "www").
 * ---------------------------------------------------------
 */
const PROTECTED_BRANDS = [
  "paypal.com",
  "google.com",
  "microsoft.com",
  "apple.com",
  "amazon.com",
  "facebook.com",
  "instagram.com",
  "chase.com",
  "bankofamerica.com",
  "wellsfargo.com",
  "netflix.com",
  "linkedin.com",
  "github.com",
  "dropbox.com",
  "adobe.com",
  "coinbase.com",
  "binance.com",
];

globalThis.PhishLensBrands = { PROTECTED_BRANDS };
