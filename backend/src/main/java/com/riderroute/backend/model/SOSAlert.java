package com.riderroute.backend.model;

import java.time.Instant;

public class SOSAlert {
    private String userId;
    private String userName;
    private LatLng location;
    private Long timestamp;

    public SOSAlert() {}

    public SOSAlert(String userId, String userName, LatLng location, Long timestamp) {
        this.userId = userId;
        this.userName = userName;
        this.location = location;
        this.timestamp = timestamp;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getUserName() {
        return userName;
    }

    public void setUserName(String userName) {
        this.userName = userName;
    }

    public LatLng getLocation() {
        return location;
    }

    public void setLocation(LatLng location) {
        this.location = location;
    }

    public Long getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(Long timestamp) {
        this.timestamp = timestamp;
    }
}
