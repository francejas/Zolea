package com.zolea.backend.services;

import com.zolea.backend.dtos.auth.AuthRequest;
import com.zolea.backend.dtos.auth.AuthResponse;
import com.zolea.backend.dtos.auth.CurrentUserResponse;
import com.zolea.backend.exceptions.auth.InvalidCredentialsException;
import com.zolea.backend.exceptions.client.ClientNotFoundException;
import com.zolea.backend.models.Client;
import com.zolea.backend.repositories.ClientRepository;
import com.zolea.backend.security.JwtUtil;
import com.zolea.backend.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuthService {

    private final AuthenticationManager authenticationManager;
    private final JwtUtil jwtUtil;
    private final ClientRepository clientRepository;

    /**
     * Verifica las credenciales y devuelve el token.
     *
     * <p>La verificación la hace el {@link AuthenticationManager} de Spring Security en lugar de
     * compararse a mano acá. Antes este método buscaba el cliente por email, lanzaba una excepción
     * si no existía y otra distinta si la contraseña no coincidía. Eso tenía dos problemas:
     *
     * <ul>
     *   <li>El «no existe» salía como <b>404</b>, que es incorrecto: el recurso que se pidió —el
     *       endpoint de login— existe. Lo que falló es la credencial, y eso es un 401.
     *   <li>Peor: las dos respuestas eran <b>distinguibles</b>, así que probando direcciones se
     *       podía averiguar cuáles están registradas sin acertar ninguna contraseña.
     * </ul>
     *
     * <p>Delegar en el manager resuelve las dos de una: Spring no distingue «usuario inexistente»
     * de «contraseña incorrecta» —convierte la primera en la segunda a propósito— y acá las dos
     * salen con el mismo mensaje y el mismo código. De paso, los beans de autenticación que el
     * proyecto ya declaraba dejan de estar sin usar.
     */
    public AuthResponse login(AuthRequest request) {
        Authentication autenticado;
        try {
            autenticado = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.email(), request.password()));
        } catch (DisabledException ex) {
            // Solo llega acá con la contraseña correcta: ver SecurityConfig (#72).
            throw new InvalidCredentialsException("Tu cuenta está desactivada. Escribinos para reactivarla.");
        } catch (AuthenticationException ex) {
            // Un solo mensaje para todos los motivos: cualquier diferencia es información.
            throw new InvalidCredentialsException("Email o contraseña incorrectos.");
        }

        UserPrincipal principal = (UserPrincipal) autenticado.getPrincipal();
        return new AuthResponse(
                jwtUtil.generateToken(principal), principal.idClient(), principal.role());
    }

    /**
     * Los datos del usuario que hizo el pedido.
     *
     * <p>Se leen <b>de la base</b> y no del token, aunque el token traiga varios de ellos. El token
     * dura una hora y guarda lo que era cierto cuando se emitió: si en el medio el usuario cambió
     * su email, o dejó de ser administrador, lo que dice el token ya no es verdad. Es la misma
     * razón por la que el rol que decide los permisos se lee de la base en cada pedido.
     *
     * @param principal el usuario autenticado, que pone el filtro de JWT.
     */
    public CurrentUserResponse currentUser(UserPrincipal principal) {
        Client client = clientRepository.findById(principal.idClient())
                .orElseThrow(() -> new ClientNotFoundException(
                        "La cuenta de esta sesión ya no existe."));

        return new CurrentUserResponse(
                client.getIdClient(),
                client.getFirstName(),
                client.getLastName(),
                client.getEmail(),
                client.getRole(),
                client.getManagedResort() != null ? client.getManagedResort().getIdResort() : null);
    }
}
