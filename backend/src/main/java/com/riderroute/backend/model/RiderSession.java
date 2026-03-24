package com.riderroute.backend.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public class RiderSession {
    private String userId;
    private String userName;
    private String avatar;
    private boolean leader;
    private LatLng location;
    private double heading;
    private double speed;
    private Instant lastUpdate;
    private boolean onRoute;
    private boolean online;
    private List<LatLng> routeFollowed = new ArrayList<>();

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

    public String getAvatar() {
        return avatar;
    }

    public void setAvatar(String avatar) {
        this.avatar = avatar;
    }

    public boolean isLeader() {
        return leader;
    }

    public void setLeader(boolean leader) {
        this.leader = leader;
    }

    public LatLng getLocation() {
        return location;
    }

    public void setLocation(LatLng location) {
        this.location = location;
    }

    public double getHeading() {
        return heading;
    }

    public void setHeading(double heading) {
        this.heading = heading;
    }

    public double getSpeed() {
        return speed;
    }

    public void setSpeed(double speed) {
        this.speed = speed;
    }

    public Instant getLastUpdate() {
        return lastUpdate;
    }

    public void setLastUpdate(Instant lastUpdate) {
        this.lastUpdate = lastUpdate;
    }

    public boolean isOnRoute() {
        return onRoute;
    }

    public void setOnRoute(boolean onRoute) {
        this.onRoute = onRoute;
    }

    public boolean isOnline() {
        return online;
    }

    public void setOnline(boolean online) {
        this.online = online;
    }

    public List<LatLng> getRouteFollowed() {
        return routeFollowed;
    }

    public void setRouteFollowed(List<LatLng> routeFollowed) {
        this.routeFollowed = routeFollowed;
    }
}
