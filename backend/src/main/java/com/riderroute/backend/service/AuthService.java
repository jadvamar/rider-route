package com.riderroute.backend.service;

import com.riderroute.backend.dto.AuthResponse;
import com.riderroute.backend.dto.LoginRequest;
import com.riderroute.backend.dto.SignupRequest;
import com.riderroute.backend.model.AppUser;
import com.riderroute.backend.repository.AppUserRepository;
import io.jsonwebtoken.Claims;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
    private final AppUserRepository appUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(AppUserRepository appUserRepository, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.appUserRepository = appUserRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    public AuthResponse signup(SignupRequest request) {
        String email = request.getEmail().trim().toLowerCase();
        if (appUserRepository.existsByEmail(email)) {
            throw new IllegalArgumentException("Email already registered");
        }

        AppUser user = new AppUser();
        user.setName(request.getName().trim());
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        AppUser saved = appUserRepository.save(user);

        return toAuthResponse(saved);
    }

    public AuthResponse login(LoginRequest request) {
        String email = request.getEmail().trim().toLowerCase();
        AppUser user = appUserRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("Invalid email or password"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new IllegalArgumentException("Invalid email or password");
        }

        return toAuthResponse(user);
    }

    public AuthResponse.UserProfile getProfile(String authHeader) {
        Claims claims = jwtService.parseToken(extractToken(authHeader));
        String userId = claims.getSubject();

        AppUser user = appUserRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        return new AuthResponse.UserProfile(user.getId(), user.getName(), user.getEmail());
    }

    private AuthResponse toAuthResponse(AppUser user) {
        String token = jwtService.createToken(user.getId(), user.getEmail());
        AuthResponse.UserProfile profile = new AuthResponse.UserProfile(user.getId(), user.getName(), user.getEmail());
        return new AuthResponse(token, profile);
    }

    private String extractToken(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new IllegalArgumentException("Missing Authorization token");
        }
        return authHeader.substring(7);
    }
}
