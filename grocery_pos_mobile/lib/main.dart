import "package:easy_localization/easy_localization.dart";
import "package:flutter/material.dart";
import "package:flutter_localizations/flutter_localizations.dart";

import "auth/login.dart";
import "auth/password_reset.dart";
import "auth/signup.dart";
import "cart/cart.dart";
import "common/constants.dart";
import "common/env.dart";
import "common/theme.dart";
import "common/widgets.dart";
import "orders/checkout.dart";
import "orders/history.dart";
import "products/detail.dart";
import "products/list.dart";

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await EasyLocalization.ensureInitialized();

  runApp(
    EasyLocalization(
      supportedLocales: const [Locale("en"), Locale("my")],
      path: "assets/langs",
      fallbackLocale: const Locale("en"),
      saveLocale: false,
      child: const GroceryPosApp(),
    ),
  );
}

class GroceryPosApp extends StatelessWidget {
  const GroceryPosApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: "app.title".tr(),
      theme: buildGroceryTheme(),
      localizationsDelegates: [
        ...context.localizationDelegates,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: context.supportedLocales,
      locale: context.locale,
      routes: {
        "/": (_) => const MobileHomeScreen(),
        routeLogin: (_) => const LoginScreen(),
        routeSignup: (_) => const SignupScreen(),
        routePasswordReset: (_) => const PasswordResetScreen(),
        routeProducts: (_) => const ProductListScreen(),
        routeProductDetail: (_) => const ProductDetailScreen(),
        routeCart: (_) => const CartScreen(),
        routeCheckout: (_) => const CheckoutScreen(),
        routeOrderHistory: (_) => const OrderHistoryScreen(),
      },
      initialRoute: "/",
    );
  }
}

class MobileHomeScreen extends StatelessWidget {
  const MobileHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text("app.title".tr())),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            "home.title".tr(),
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          Text("home.subtitle".tr()),
          const SizedBox(height: 8),
          Text("home.env".tr()),
          const SizedBox(height: 4),
          Text(
            AppEnv.runtimeNotice,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 16),
          for (final module in phase2ModuleTiles) ModuleCard(module: module),
        ],
      ),
    );
  }
}
