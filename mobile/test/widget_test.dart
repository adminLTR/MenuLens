import 'package:flutter_test/flutter_test.dart';
import 'package:menulens/controllers/home_controller.dart';
import 'package:menulens/models/server_status.dart';
import 'package:menulens/services/health_service.dart';
import 'package:menulens/views/home/home_view.dart';
import 'package:flutter/material.dart';

class _FakeHealthService extends HealthService {
  @override
  Future<ServerStatus> fetchStatus() async =>
      const ServerStatus(service: 'menulens-api', database: 'up');
}

void main() {
  testWidgets('HomeView shows server status from controller', (tester) async {
    final controller = HomeController(healthService: _FakeHealthService());

    await tester.pumpWidget(MaterialApp(home: HomeView(controller: controller)));
    await tester.pumpAndSettle();

    expect(find.textContaining('Database: up'), findsOneWidget);
  });
}
