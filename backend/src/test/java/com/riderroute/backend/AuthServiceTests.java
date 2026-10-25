package com.riderroute.backend;

import com.riderroute.backend.dto.LoginRequest;
import com.riderroute.backend.model.AppUser;
import com.riderroute.backend.repository.AppUserRepository;
import com.riderroute.backend.service.AuthService;
import com.riderroute.backend.service.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AuthServiceTests {
    private final AppUserRepository repository = mock(AppUserRepository.class);
    private final PasswordEncoder encoder = mock(PasswordEncoder.class);
    private final JwtService jwtService = mock(JwtService.class);
    private final AuthService service = new AuthService(repository, encoder, jwtService);

    private LoginRequest loginRequest() {
        LoginRequest request = new LoginRequest();
        request.setEmail(" Rider@Example.com ");
        request.setPassword("test-password");
        return request;
    }

    @Test
    void unregisteredEmailHasADistinctLoginError() {
        when(repository.findByEmail("rider@example.com")).thenReturn(Optional.empty());

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> service.login(loginRequest()));

        assertEquals("Email not registered", error.getMessage());
        verifyNoInteractions(encoder, jwtService);
        verify(repository, never()).save(any());
    }

    @Test
    void registeredEmailWithWrongPasswordKeepsInvalidCredentialsError() {
        AppUser user = new AppUser();
        user.setPasswordHash("stored-hash");
        when(repository.findByEmail("rider@example.com")).thenReturn(Optional.of(user));
        when(encoder.matches("test-password", "stored-hash")).thenReturn(false);

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> service.login(loginRequest()));

        assertEquals("Invalid email or password", error.getMessage());
        verifyNoInteractions(jwtService);
    }
}