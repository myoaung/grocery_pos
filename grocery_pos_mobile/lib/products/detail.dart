import "package:easy_localization/easy_localization.dart";
import "package:flutter/material.dart";

class ProductDetailScreen extends StatelessWidget {
  const ProductDetailScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text("screens.productDetail".tr())),
      body: Center(child: Text("screens.productDetail".tr())),
    );
  }
}
