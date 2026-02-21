import "package:flutter/material.dart";

ThemeData buildGroceryTheme() {
  const seedColor = Color(0xFF0F766E);
  return ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(seedColor: seedColor),
    appBarTheme: const AppBarTheme(centerTitle: false, elevation: 0),
  );
}
