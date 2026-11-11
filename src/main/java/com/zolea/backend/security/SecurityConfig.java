package com.zolea.backend.security;

import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.nio.charset.StandardCharsets;
import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * Quien verifica un usuario y su contraseña. Lo usa {@code AuthService} al iniciar sesión.
     *
     * <p>Antes había dos beans acá —un {@code AuthenticationProvider} y este manager— que
     * <b>nadie inyectaba</b>, mientras el login comparaba la contraseña a mano en el servicio. Y
     * la cadena de filtros llamaba a {@code authenticationProvider(...)} como método en vez de
     * usar el bean, así que el proveedor se construía dos veces.
     *
     * <p>Ahora el proveedor se arma acá adentro y no se publica como bean suelto: es un detalle
     * de cómo está construido el manager, no algo que otro componente deba poder inyectar.
     */
    @Bean
    public AuthenticationManager authenticationManager(UserDetailsService userDetailsService,
                                                       PasswordEncoder passwordEncoder) {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder);
        return new ProviderManager(provider);
    }

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            JwtAuthenticationFilter jwtAuthFilter
    ) throws Exception {
        return http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // El reenvío interno a /error y la reanudación de peticiones asíncronas no
                        // son peticiones del usuario: si se les aplicara denyAll, un error legítimo
                        // se convertiría en una respuesta vacía sin explicación.
                        .dispatcherTypeMatchers(DispatcherType.ERROR, DispatcherType.ASYNC).permitAll()
                        // Swagger / OpenAPI
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        // Rutas públicas
                        // Solo el login es público. /api/auth/me devuelve quién está conectado, así
                        // que exige justamente lo que devuelve: un token válido.
                        .requestMatchers("/api/auth/login").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/clients").permitAll()
                        // /api/resorts/* abre la ficha de cada balneario, y de paso agarraba
                        // /api/resorts/my: sin token llegaba al @PreAuthorize y respondía 403, y el
                        // panel con la sesión vencida no mandaba al login. Va antes, y pide sesión.
                        .requestMatchers(HttpMethod.GET, "/api/resorts/my").authenticated()
                        // /api/resorts/* abarca un solo tramo: las reseñas y las unidades ocupadas,
                        // que también son públicas, necesitan su propia regla.
                        .requestMatchers(HttpMethod.GET, "/api/resorts", "/api/resorts/*",
                                "/api/resorts/*/reviews", "/api/resorts/*/occupied-units").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/amenities", "/api/amenities/*").permitAll()
                        // Validar el ingreso ya no es público: lo hace el administrador, sobre las
                        // reservas de su balneario (GuestController). Lo cubre /api/guests/** de abajo.
                        // Los tres retornos y el aviso automático: los llama MercadoPago, que no
                        // tiene el token de la aplicación. Ninguno confía en lo que le llega — los
                        // cuatro consultan el pago contra la pasarela antes de tocar nada.
                        .requestMatchers("/api/bookings/success", "/api/bookings/pending",
                                "/api/bookings/failure", "/api/bookings/notifications").permitAll()
                        // Rutas de la API que exigen sesión. El permiso fino —quién es dueño de qué,
                        // y qué exige rol ADMIN— vive en los @PreAuthorize de cada endpoint, que es
                        // donde se puede expresar; acá solo se exige estar autenticado.
                        .requestMatchers("/api/auth/**", "/api/clients/**", "/api/resorts/**",
                                "/api/rental-units/**", "/api/bookings/**", "/api/guests/**",
                                "/api/amenities/**").authenticated()
                        // Antes acá había authenticated(), y eso convertía cada endpoint nuevo en
                        // público-para-cualquier-usuario por omisión: alcanzaba con olvidarse de una
                        // anotación. Con denyAll, olvidarse cierra el endpoint en lugar de abrirlo,
                        // y el olvido se nota en la primera prueba en vez de en producción.
                        .anyRequest().denyAll()
                )
                // Sin esto, una petición sin credencial válida cae en el Http403ForbiddenEntryPoint
                // que Spring usa por defecto cuando no hay login por formulario: devuelve 403 donde
                // corresponde un 401. La diferencia importa: el frontend manda al login con el 401
                // y muestra "no tenés permiso" con el 403, así que confundirlos deja al usuario con
                // la sesión vencida mirando un error que no puede resolver.
                .exceptionHandling(ex -> ex.authenticationEntryPoint(unauthorizedEntryPoint()))
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }

    /**
     * La respuesta 401. Mantiene la forma {@code {"error": "..."}} del resto de la API, que es la
     * que lee el frontend, en lugar de la página HTML de error que produciría {@code sendError}.
     */
    private AuthenticationEntryPoint unauthorizedEntryPoint() {
        return (request, response, authException) -> {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write("{\"error\":\"Credenciales ausentes o vencidas\"}");
        };
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(List.of("*"));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "ngrok-skip-browser-warning"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
