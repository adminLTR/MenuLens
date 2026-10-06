import 'package:flutter/material.dart';

import '../../views/home/home_view.dart';

class AppRoutes {
  AppRoutes._();

  static const String home = '/';

  static Map<String, WidgetBuilder> get routes => {
        home: (_) => const HomeView(),
      };
}
