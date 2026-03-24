package com.riderroute.backend.dto;

import jakarta.validation.constraints.NotBlank;

public class JoinRideRequest {
    @NotBlank
    private String userId;
    @NotBlank
    private String userName;
    private String avatar;
    private boolean leader;

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
}
