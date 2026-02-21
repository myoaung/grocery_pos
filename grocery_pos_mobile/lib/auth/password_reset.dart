import "package:easy_localization/easy_localization.dart";
import "package:flutter/material.dart";

class PasswordResetScreen extends StatelessWidget {
  const PasswordResetScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text("screens.passwordReset".tr())),
      body: Center(child: Text("screens.passwordReset".tr())),
    );
  }
}
