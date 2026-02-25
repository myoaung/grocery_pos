import "dart:convert";
import "dart:math";

import "package:easy_localization/easy_localization.dart";
import "package:flutter/material.dart";
import "package:shared_preferences/shared_preferences.dart";

enum SyncStatus { pending, synced, conflict }

class CheckoutLine {
  CheckoutLine({
    required this.productName,
    required this.quantity,
    required this.unitPrice,
  });

  final String productName;
  final int quantity;
  final double unitPrice;

  double get lineTotal => quantity * unitPrice;

  Map<String, dynamic> toJson() => {
    "productName": productName,
    "quantity": quantity,
    "unitPrice": unitPrice,
    "lineTotal": lineTotal,
  };

  static CheckoutLine fromJson(Map<String, dynamic> json) {
    return CheckoutLine(
      productName: (json["productName"] ?? "").toString(),
      quantity: int.tryParse("${json["quantity"]}") ?? 0,
      unitPrice: double.tryParse("${json["unitPrice"]}") ?? 0,
    );
  }
}

class CheckoutDraft {
  CheckoutDraft({
    required this.draftId,
    required this.offlineMode,
    required this.syncStatus,
    required this.lines,
    required this.updatedAt,
  });

  final String draftId;
  final bool offlineMode;
  final SyncStatus syncStatus;
  final List<CheckoutLine> lines;
  final DateTime updatedAt;

  Map<String, dynamic> toJson() => {
    "draftId": draftId,
    "offlineMode": offlineMode,
    "syncStatus": syncStatus.name,
    "updatedAt": updatedAt.toIso8601String(),
    "lines": lines.map((line) => line.toJson()).toList(),
  };

  static CheckoutDraft fromJson(Map<String, dynamic> json) {
    final statusRaw = (json["syncStatus"] ?? "pending").toString();
    final status = SyncStatus.values.firstWhere(
      (value) => value.name == statusRaw,
      orElse: () => SyncStatus.pending,
    );
    final lineItems = (json["lines"] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(CheckoutLine.fromJson)
        .toList();
    final updatedAt =
        DateTime.tryParse((json["updatedAt"] ?? "").toString()) ??
            DateTime.now();
    return CheckoutDraft(
      draftId: (json["draftId"] ?? "").toString(),
      offlineMode: json["offlineMode"] == true,
      syncStatus: status,
      lines: lineItems,
      updatedAt: updatedAt,
    );
  }
}

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  static const String _draftKey = "checkout_draft_v1";
  static const String _defaultTenantId = "tenant-a";
  static const String _defaultBranchId = "branch-a-1";
  static const String _apiQueuePath = "/api/v1/tenants/{tenantId}/sync/queue";
  static const String _apiRetryPath = "/api/v1/tenants/{tenantId}/sync/retry";

  final TextEditingController _productController = TextEditingController();
  final TextEditingController _qtyController =
      TextEditingController(text: "1");
  final TextEditingController _priceController =
      TextEditingController(text: "0");

  bool _offlineMode = true;
  SyncStatus _syncStatus = SyncStatus.pending;
  List<CheckoutLine> _lines = [];
  String _draftId = "";
  DateTime _updatedAt = DateTime.now();
  String _statusMessage = "";
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadDraft();
  }

  @override
  void dispose() {
    _productController.dispose();
    _qtyController.dispose();
    _priceController.dispose();
    super.dispose();
  }

  Future<void> _loadDraft() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_draftKey);
    if (raw == null || raw.isEmpty) {
      _resetDraft();
      setState(() {
        _loading = false;
      });
      await _persistDraft();
      return;
    }
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) {
        final draft = CheckoutDraft.fromJson(decoded);
        setState(() {
          _draftId = draft.draftId.isEmpty ? _newUuid() : draft.draftId;
          _offlineMode = draft.offlineMode;
          _syncStatus = draft.syncStatus;
          _lines = draft.lines;
          _updatedAt = draft.updatedAt;
          _loading = false;
        });
        return;
      }
    } catch (_) {
      // Fall back to a fresh draft if data is malformed.
    }
    _resetDraft();
    setState(() {
      _loading = false;
    });
    await _persistDraft();
  }

  void _resetDraft() {
    _draftId = _newUuid();
    _offlineMode = true;
    _syncStatus = SyncStatus.pending;
    _lines = [];
    _updatedAt = DateTime.now();
    _statusMessage = "";
  }

  String _newUuid() {
    final random = Random.secure();
    String hex(int length) =>
        List.generate(length, (_) => random.nextInt(16).toRadixString(16))
            .join();
    return "${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}";
  }

  Future<void> _persistDraft() async {
    final prefs = await SharedPreferences.getInstance();
    _updatedAt = DateTime.now();
    final draft = CheckoutDraft(
      draftId: _draftId,
      offlineMode: _offlineMode,
      syncStatus: _syncStatus,
      lines: _lines,
      updatedAt: _updatedAt,
    );
    await prefs.setString(_draftKey, jsonEncode(draft.toJson()));
  }

  double get _total =>
      _lines.fold(0, (sum, line) => sum + line.lineTotal);

  String _syncLabel(SyncStatus status) {
    switch (status) {
      case SyncStatus.synced:
        return "SYNCED";
      case SyncStatus.conflict:
        return "CONFLICT";
      case SyncStatus.pending:
      default:
        return "PENDING";
    }
  }

  Color _syncColor(SyncStatus status, BuildContext context) {
    switch (status) {
      case SyncStatus.synced:
        return Colors.green.shade700;
      case SyncStatus.conflict:
        return Colors.red.shade700;
      case SyncStatus.pending:
      default:
        return Theme.of(context).colorScheme.primary;
    }
  }

  void _setStatus(String message) {
    setState(() {
      _statusMessage = message;
    });
  }

  Future<void> _addLine() async {
    final name = _productController.text.trim();
    final qty = int.tryParse(_qtyController.text.trim()) ?? 0;
    final price = double.tryParse(_priceController.text.trim()) ?? 0;
    if (name.isEmpty || qty <= 0 || price < 0) {
      _setStatus("Enter a product name, quantity, and unit price.");
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _lines.add(
        CheckoutLine(productName: name, quantity: qty, unitPrice: price),
      );
      _syncStatus = SyncStatus.pending;
    });
    _productController.clear();
    _qtyController.text = "1";
    _priceController.text = "0";
    _setStatus("Line item added. Draft is pending sync.");
    await _persistDraft();
  }

  Future<void> _removeLine(int index) async {
    if (index < 0 || index >= _lines.length) return;
    setState(() {
      _lines.removeAt(index);
      _syncStatus = SyncStatus.pending;
    });
    _setStatus("Line item removed. Draft is pending sync.");
    await _persistDraft();
  }

  Future<void> _toggleOffline(bool value) async {
    setState(() {
      _offlineMode = value;
      if (_offlineMode) {
        _syncStatus = SyncStatus.pending;
      }
    });
    _setStatus(_offlineMode
        ? "Offline mode enabled. Orders will queue locally."
        : "Online mode enabled. Ready to sync queued orders.");
    await _persistDraft();
  }

  Future<void> _syncNow() async {
    if (_lines.isEmpty) {
      _setStatus("No items to sync.");
      return;
    }
    if (_offlineMode) {
      setState(() {
        _syncStatus = SyncStatus.pending;
      });
      _setStatus("Offline: draft queued locally for sync.");
      await _persistDraft();
      return;
    }
    setState(() {
      _syncStatus = SyncStatus.synced;
    });
    _setStatus("Draft synced.");
    await _persistDraft();
  }

  Future<void> _markConflict() async {
    if (_lines.isEmpty) {
      _setStatus("No items available for conflict simulation.");
      return;
    }
    setState(() {
      _syncStatus = SyncStatus.conflict;
    });
    _setStatus("Conflict flagged. Manager resolution required.");
    await _persistDraft();
  }

  Future<void> _resolveConflict({required bool keepLocal}) async {
    if (keepLocal) {
      setState(() {
        _syncStatus = SyncStatus.pending;
      });
      _setStatus("Conflict acknowledged. Draft remains pending for sync.");
    } else {
      setState(() {
        _lines = [];
        _syncStatus = SyncStatus.synced;
      });
      _setStatus("Local draft discarded after conflict.");
    }
    await _persistDraft();
  }

  Future<void> _clearDraft() async {
    setState(() {
      _resetDraft();
    });
    _setStatus("Draft cleared.");
    await _persistDraft();
  }

  Map<String, dynamic> _buildQueuePayload() {
    return {
      "eventType": "SALE",
      "payload": {
        "tenantId": _defaultTenantId,
        "branchId": _defaultBranchId,
        "draftId": _draftId,
        "lines": _lines.map((line) => line.toJson()).toList(),
        "total": _total,
        "currency": "MMK",
        "createdAt": _updatedAt.toIso8601String(),
      },
      "idempotencyKey": _draftId,
      "deviceId": "mobile-offline",
    };
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text("screens.checkout".tr())),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _buildStatusCard(context),
                const SizedBox(height: 12),
                _buildEntryCard(),
                const SizedBox(height: 12),
                _buildLinesCard(),
                const SizedBox(height: 12),
                _buildSyncCard(),
                if (_syncStatus == SyncStatus.conflict) ...[
                  const SizedBox(height: 12),
                  _buildConflictCard(),
                ],
                const SizedBox(height: 12),
                _buildApiAlignmentCard(),
              ],
            ),
    );
  }

  Widget _buildStatusCard(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "Offline-First Checkout",
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text("Offline mode"),
              subtitle: Text(_offlineMode
                  ? "Local persistence enabled"
                  : "Online sync enabled"),
              value: _offlineMode,
              onChanged: (value) => _toggleOffline(value),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Text(
                  "Sync Status: ",
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: _syncColor(_syncStatus, context),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    _syncLabel(_syncStatus),
                    style: const TextStyle(color: Colors.white),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text("Draft ID: $_draftId"),
            Text(
              "Last saved: ${_updatedAt.toLocal().toString().replaceFirst('.000', '')}",
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (_statusMessage.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                _statusMessage,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildEntryCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("Local Cart (persisted offline)"),
            const SizedBox(height: 12),
            TextField(
              controller: _productController,
              decoration: const InputDecoration(
                labelText: "Product name",
              ),
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _qtyController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: "Qty"),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _priceController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: "Unit price"),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                ElevatedButton(
                  onPressed: _addLine,
                  child: const Text("Add item"),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: _clearDraft,
                  child: const Text("Clear draft"),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLinesCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("Draft items"),
            const SizedBox(height: 8),
            if (_lines.isEmpty)
              const Text("No items queued.")
            else
              Column(
                children: List.generate(_lines.length, (index) {
                  final item = _lines[index];
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(item.productName),
                    subtitle:
                        Text("${item.quantity} x ${item.unitPrice.toStringAsFixed(2)}"),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(item.lineTotal.toStringAsFixed(2)),
                        IconButton(
                          icon: const Icon(Icons.close),
                          onPressed: () => _removeLine(index),
                        ),
                      ],
                    ),
                  );
                }),
              ),
            const Divider(),
            Align(
              alignment: Alignment.centerRight,
              child: Text(
                "Total: ${_total.toStringAsFixed(2)}",
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSyncCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("Sync & Conflict Controls"),
            const SizedBox(height: 8),
            Text(
              _offlineMode
                  ? "Offline: draft will remain pending."
                  : "Online: sync will mark draft as synced.",
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                ElevatedButton(
                  onPressed: _syncNow,
                  child: const Text("Sync now"),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: _markConflict,
                  child: const Text("Mark conflict"),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildConflictCard() {
    return Card(
      color: Colors.red.shade50,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("Conflict detected"),
            const SizedBox(height: 8),
            const Text(
              "This draft requires manager resolution before it can be synced.",
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                ElevatedButton(
                  onPressed: () => _resolveConflict(keepLocal: true),
                  child: const Text("Keep local"),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: () => _resolveConflict(keepLocal: false),
                  child: const Text("Discard draft"),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildApiAlignmentCard() {
    final payload = const JsonEncoder.withIndent("  ").convert(
      _buildQueuePayload(),
    );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("Backend Offline Sync Alignment"),
            const SizedBox(height: 8),
            Text("Queue endpoint: $_apiQueuePath"),
            Text("Retry endpoint: $_apiRetryPath"),
            const SizedBox(height: 8),
            const Text("Queued payload (local draft):"),
            const SizedBox(height: 4),
            SelectableText(payload),
          ],
        ),
      ),
    );
  }
}
