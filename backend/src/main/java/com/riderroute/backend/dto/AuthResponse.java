package com.riderroute.backend.dto;

public class AuthResponse {
    private String token;
    private UserProfile user;

    public AuthResponse(String token, UserProfile user) {
        this.token = token;
        this.user = user;
    }

    public String getToken() {
        return token;
    }

    public UserProfile getUser() {
        return user;
    }

    public record UserProfile(String id, String name, String email) {
    }
}
