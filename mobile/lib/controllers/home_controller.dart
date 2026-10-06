import 'package:flutter/foundation.dart';

import '../models/server_status.dart';
import '../services/health_service.dart';

class HomeController extends ChangeNotifier {
  HomeController({HealthService? healthService})
      : _healthService = healthService ?? HealthService();

  final HealthService _healthService;

  ServerStatus? status;
  String? errorMessage;
  bool isLoading = false;

  Future<void> checkServer() async {
    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      status = await _healthService.fetchStatus();
    } catch (e) {
      status = null;
      errorMessage = 'Cannot reach the server';
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }
}
