import "package:easy_localization/easy_localization.dart";
import "package:flutter/material.dart";

import "../common/constants.dart";

class CartScreen extends StatelessWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text("modules.cart".tr())),
      body: Center(
        child: FilledButton(
          onPressed: () => Navigator.of(context).pushNamed(routeCheckout),
          child: Text("screens.checkout".tr()),
        ),
      ),
    );
  }
}
