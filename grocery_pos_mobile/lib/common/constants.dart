class ModuleTileConfig {
  const ModuleTileConfig({required this.titleKey, required this.route});

  final String titleKey;
  final String route;
}

const String routeLogin = "/auth/login";
const String routeSignup = "/auth/signup";
const String routePasswordReset = "/auth/password-reset";
const String routeProducts = "/products";
const String routeProductDetail = "/products/detail";
const String routeCart = "/cart";
const String routeCheckout = "/orders/checkout";
const String routeOrderHistory = "/orders/history";

const List<ModuleTileConfig> phase2ModuleTiles = <ModuleTileConfig>[
  ModuleTileConfig(titleKey: "modules.auth", route: routeLogin),
  ModuleTileConfig(titleKey: "modules.products", route: routeProducts),
  ModuleTileConfig(titleKey: "modules.cart", route: routeCart),
  ModuleTileConfig(titleKey: "modules.orders", route: routeOrderHistory),
];
