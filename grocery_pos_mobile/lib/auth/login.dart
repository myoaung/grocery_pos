import "package:easy_localization/easy_localization.dart";
import "package:flutter/material.dart";

import "../common/constants.dart";

class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text("modules.auth".tr())),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text("screens.auth".tr()),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => Navigator.of(context).pushNamed(routeSignup),
              child: Text("screens.signup".tr()),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () =>
                  Navigator.of(context).pushNamed(routePasswordReset),
              child: Text("screens.passwordReset".tr()),
            ),
          ],
        ),
      ),
    );
  }
}
