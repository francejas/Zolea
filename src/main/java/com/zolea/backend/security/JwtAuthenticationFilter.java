package com.zolea.backend.security;

import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jspecify.annotations.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;
    private final UserDetailsService userDetailsService;

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain chain
    ) throws ServletException, IOException {
        final String authHeader = request.getHeader("Authorization");
        final String jwt;
        final String username;

        // 1. Validar que el header "Authorization" exista y empiece con "Bearer "
        if(authHeader == null || !authHeader.startsWith("Bearer ")) {
            chain.doFilter(request, response);
            return;
        }

        // 2. Extraer el token (quitando la palabra "Bearer " que son 7 caracteres)
        jwt = authHeader.substring(7);

        // Un token vencido, mal firmado o ilegible hace que extractUsername lance. Ese error NO
        // puede propagarse: este filtro corre antes del DispatcherServlet, así que el
        // @RestControllerAdvice no lo ve y la excepción termina saliendo como HTTP 500. Un token
        // que no sirve es un problema de credencial, o sea un 401, y eso es lo que el frontend
        // sabe atender (te manda al login). Como el token dura una hora, el caso es rutinario.
        //
        // La respuesta 401 no se escribe acá: se deja la petición sin autenticar y la produce el
        // authenticationEntryPoint de SecurityConfig, que es el único lugar donde vive ese formato.
        try {
            username = jwtUtil.extractUsername(jwt);
        } catch (JwtException | IllegalArgumentException ex) {
            log.debug("Token descartado: {}", ex.getMessage());
            chain.doFilter(request, response);
            return;
        }

        // 3. Si el token tiene usuario y el usuario no está ya autenticado en el contexto de Spring
        if(username != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            UserDetails userDetails = userDetailsService.loadUserByUsername(username);

            // 4. Validar si el token sigue siendo vigente y corresponde al usuario. La cuenta se lee
            // de la base en cada pedido: si la desactivaron, el token deja de valer acá (401), aunque
            // no haya vencido (#72).
            if(userDetails.isEnabled() && jwtUtil.validateToken(jwt, userDetails)) {
                UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
                        userDetails, null, userDetails.getAuthorities()
                );

                authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

                // 5. Guardar la autenticación en el contexto de Spring Security
                SecurityContextHolder.getContext().setAuthentication(authToken);
            }
        }

        // 6. Continuar con el siguiente filtro en la cadena
        chain.doFilter(request, response);
    }
}
