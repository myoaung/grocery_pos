import "package:easy_localization/easy_localization.dart";
import "package:flutter/material.dart";

import "constants.dart";

class ModuleCard extends StatelessWidget {
  const ModuleCard({super.key, required this.module});

  final ModuleTileConfig module;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        title: Text(module.titleKey.tr()),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => Navigator.of(context).pushNamed(module.route),
      ),
    );
  }
}
