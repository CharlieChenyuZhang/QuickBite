# Ordering layout references

Reviewed September 13, 2026. These public pages informed the information hierarchy, not a reproduction of their branding or proprietary assets.

| Reference                                                                                                                           | Useful pattern                                                                                      | QuickBite application                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [Uber Eats restaurant discovery](https://www.ubereats.com/city/san-francisco-ca)                                                    | Cuisine categories organize restaurant records with clear names and concise supporting information. | Put cuisine filters and restaurant cards near the top of the page. Keep names and descriptions together and avoid duplicate menu labels. |
| [DoorDash restaurant discovery](https://www.doordash.com/food-delivery/san-francisco-ca-restaurants/)                               | Restaurant identity, food, and prices support the ordering decision.                                | Prioritize restaurant and menu content over promotional copy. Display only information available in the existing data.                   |
| [Deliveroo homepage](https://deliveroo.co.uk/) and [menu](https://deliveroo.co.uk/menu/london/london-bridge/bleecker-london-bridge) | A clear search entry, account access, store context, menu search, and checkout destination.         | Use one header, a compact restaurant introduction, searchable menu rows, and a visible cart action.                                      |

## Resulting structure

- Header: brand, Restaurants, Saved, global search, account, and cart. Mobile controls remain directly available, with no navigation drawer.
- Discovery: one title, cuisine filters, result count and sorting, then the restaurant grid. No advertising hero or permanent sidebar.
- Menu: restaurant details, local menu search, dish descriptions and prices, accessible add buttons, and a compact cart shortcut.
- Cart and checkout: line items and quantity, server-provided total, and one primary next action. Error recovery and demo disclosures remain visible.
- Authentication: one form column with clear labels, validation, password visibility, and account creation or sign-in links.

The existing authentication, saved restaurants, cart, checkout, logout, and account-switching behavior is preserved. Ratings, delivery estimates, fees, and promotions are not fabricated. Existing food imagery is retained.
