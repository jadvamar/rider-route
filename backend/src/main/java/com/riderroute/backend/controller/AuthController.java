package com.riderroute.backend.controller;

import com.riderroute.backend.dto.AuthResponse;
import com.riderroute.backend.dto.LoginRequest;
import com.riderroute.backend.dto.SignupRequest;
import com.riderroute.backend.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/signup")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse signup(@Valid @RequestBody SignupRequest request) {
        System.out.println("Signup request received: " + request.getEmail());
        return authService.signup(request);
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @GetMapping("/me")
    public AuthResponse.UserProfile me(@RequestHeader("Authorization") String authHeader) {
        return authService.getProfile(authHeader);
    }
}
