class AppEnv {
  const AppEnv._();

  static const String supabaseUrl = String.fromEnvironment(
    "SUPABASE_URL",
    defaultValue: "https://your-project-ref.supabase.co",
  );

  static const String supabaseAnonKey = String.fromEnvironment(
    "SUPABASE_ANON_KEY",
    defaultValue: "your-supabase-anon-key",
  );

  // Mobile clients must not embed service role or database credentials.
  static String get runtimeNotice {
    const placeholderHost = "your-project-ref";
    const placeholderKey = "your-supabase-anon-key";
    final usingPlaceholders =
        supabaseUrl.contains(placeholderHost) ||
        supabaseAnonKey == placeholderKey;
    return usingPlaceholders
        ? "Using placeholder Supabase client config."
        : "Using compile-time Supabase client config.";
  }
}
