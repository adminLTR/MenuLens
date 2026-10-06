import 'package:flutter/material.dart';

import '../../controllers/home_controller.dart';

class HomeView extends StatefulWidget {
  const HomeView({super.key, this.controller});

  final HomeController? controller;

  @override
  State<HomeView> createState() => _HomeViewState();
}

class _HomeViewState extends State<HomeView> {
  late final HomeController _controller = widget.controller ?? HomeController();

  @override
  void initState() {
    super.initState();
    _controller.checkServer();
  }

  @override
  void dispose() {
    if (widget.controller == null) _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('MenuLens')),
      body: Center(
        child: ListenableBuilder(
          listenable: _controller,
          builder: (context, _) {
            if (_controller.isLoading) {
              return const CircularProgressIndicator();
            }
            final status = _controller.status;
            final text = status == null
                ? _controller.errorMessage ?? ''
                : 'API: ${status.service}\nDatabase: ${status.database}';
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(text, textAlign: TextAlign.center),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _controller.checkServer,
                  child: const Text('Check server'),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
