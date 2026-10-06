import '../core/network/api_client.dart';
import '../models/server_status.dart';

class HealthService {
  HealthService({ApiClient? apiClient}) : _api = apiClient ?? ApiClient();

  final ApiClient _api;

  Future<ServerStatus> fetchStatus() async {
    final data = await _api.get('/health') as Map<String, dynamic>;
    return ServerStatus.fromJson(data);
  }
}
