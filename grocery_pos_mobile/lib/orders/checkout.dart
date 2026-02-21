import "package:easy_localization/easy_localization.dart";
import "package:flutter/material.dart";

class CheckoutScreen extends StatelessWidget {
  const CheckoutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text("screens.checkout".tr())),
      body: Center(child: Text("screens.checkout".tr())),
    );
  }
}
