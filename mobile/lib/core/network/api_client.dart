import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import 'api_exception.dart';

class ApiClient {
  ApiClient({http.Client? httpClient, String? baseUrl})
      : _http = httpClient ?? http.Client(),
        _baseUrl = baseUrl ?? AppConfig.apiBaseUrl;

  final http.Client _http;
  final String _baseUrl;

  Future<dynamic> get(String path) async {
    final response = await _http
        .get(Uri.parse('$_baseUrl$path'), headers: _headers)
        .timeout(AppConfig.requestTimeout);
    return _decode(response);
  }

  Future<dynamic> post(String path, {Object? body}) async {
    final response = await _http
        .post(Uri.parse('$_baseUrl$path'), headers: _headers, body: jsonEncode(body))
        .timeout(AppConfig.requestTimeout);
    return _decode(response);
  }

  Map<String, String> get _headers => const {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

  dynamic _decode(http.Response response) {
    final body = response.body.isEmpty ? null : jsonDecode(response.body);
    if (body is Map<String, dynamic> && body['success'] == true) {
      return body['data'];
    }
    final message = body is Map<String, dynamic>
        ? (body['error']?['message'] as String? ?? 'Unexpected error')
        : 'Unexpected error';
    throw ApiException(message, statusCode: response.statusCode);
  }
}
