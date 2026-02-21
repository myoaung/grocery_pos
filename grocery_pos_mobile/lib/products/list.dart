import "package:easy_localization/easy_localization.dart";
import "package:flutter/material.dart";

import "../common/constants.dart";

class ProductListScreen extends StatelessWidget {
  const ProductListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text("modules.products".tr())),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ListTile(
            title: const Text("DEMO-SKU-001"),
            subtitle: const Text("Demo Rice 1kg"),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).pushNamed(routeProductDetail),
          ),
          ListTile(
            title: const Text("DEMO-SKU-002"),
            subtitle: const Text("Demo Cooking Oil 1L"),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).pushNamed(routeProductDetail),
          ),
        ],
      ),
    );
  }
}
