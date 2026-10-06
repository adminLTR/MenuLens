class ServerStatus {
  const ServerStatus({required this.service, required this.database});

  final String service;
  final String database;

  bool get isDatabaseUp => database == 'up';

  factory ServerStatus.fromJson(Map<String, dynamic> json) => ServerStatus(
        service: json['service'] as String,
        database: json['database'] as String,
      );
}
