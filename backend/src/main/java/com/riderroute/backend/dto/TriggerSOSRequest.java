package com.riderroute.backend.dto;

import com.riderroute.backend.model.LatLng;

public class TriggerSOSRequest {
    private String userId;
    private String userName;
    private LatLng location;

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
}
