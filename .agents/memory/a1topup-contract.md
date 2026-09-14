---
name: A1Topup legacy recharge contract
description: Provider compatibility constraints for the legacy A1Topup recharge endpoint.
---

The legacy A1Topup recharge API documents numeric `orderid` values and whole-rupee amounts as integers. Keep provider-facing order IDs numeric and avoid unnecessary `.00` formatting for integer recharge amounts.

**Why:** The provider can reject otherwise valid mobile recharge requests when the order ID or amount format does not match the legacy endpoint contract, which results in a provider failure followed by a wallet refund.

**How to apply:** Preserve the app's internal transaction ID separately, but use a numeric provider order ID for new A1Topup recharge requests. Continue to preserve decimal formatting only when a recharge explicitly contains paise.