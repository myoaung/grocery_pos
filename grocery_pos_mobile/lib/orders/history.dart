import "package:easy_localization/easy_localization.dart";
import "package:flutter/material.dart";

class OrderHistoryScreen extends StatelessWidget {
  const OrderHistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text("modules.orders".tr())),
      body: Center(child: Text("screens.orderHistory".tr())),
    );
  }
}
