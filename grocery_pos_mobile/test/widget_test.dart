import "package:easy_localization/easy_localization.dart";
import "package:flutter/material.dart";
import "package:flutter_test/flutter_test.dart";
import "package:grocery_pos/main.dart";
import "package:shared_preferences/shared_preferences.dart";

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await EasyLocalization.ensureInitialized();
  });

  testWidgets("renders phase 2 scaffold shell", (WidgetTester tester) async {
    await tester.pumpWidget(
      EasyLocalization(
        supportedLocales: const [Locale("en"), Locale("my")],
        path: "assets/langs",
        fallbackLocale: const Locale("en"),
        saveLocale: false,
        child: const GroceryPosApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text("Grocery POS"), findsOneWidget);
    expect(find.text("Phase 2 Mobile Scaffold"), findsOneWidget);
    expect(find.text("Authentication"), findsOneWidget);
  });
}
