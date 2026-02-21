import "package:easy_localization/easy_localization.dart";
import "package:flutter/material.dart";

class SignupScreen extends StatelessWidget {
  const SignupScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text("screens.signup".tr())),
      body: Center(child: Text("screens.signup".tr())),
    );
  }
}
