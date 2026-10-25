package com.riderroute.backend.model;

public record WrongRouteAlert(String id, String fromUserId, String fromUserName, long timestamp) {}