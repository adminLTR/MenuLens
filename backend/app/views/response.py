from flask import jsonify


def json_ok(payload, status=200):
    return jsonify(payload), status


def json_error(payload, status=500):
    return jsonify(payload), status
