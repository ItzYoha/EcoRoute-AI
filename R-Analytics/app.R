library(shiny)
library(ggplot2)
library(readr)

live_csv_path <- "../control-plane-brain/data/gold/live_rps_with_intervals.csv"
bench_summary_path <- "../control-plane-brain/data/gold/benchmark_summary.csv"
bench_requests_path <- "../control-plane-brain/data/gold/benchmark_requests.csv"
predictions_export_path <- "../control-plane-brain/data/gold/predictions_export.csv"

# Autoscaler constants matching control-plane-brain/main.py
CAPACITY_PER_INSTANCE <- 250
TARGET_UTILIZATION <- 0.75
EFFECTIVE_CAPACITY <- CAPACITY_PER_INSTANCE * TARGET_UTILIZATION # 187.5 RPS
MIN_INSTANCES <- 2
MAX_INSTANCES <- 10

derive_instances <- function(rps_vec) {
  req <- ceiling(rps_vec / EFFECTIVE_CAPACITY)
  pmin(MAX_INSTANCES, pmax(MIN_INSTANCES, req))
}

read_live_data <- function() {
  if (!file.exists(live_csv_path)) {
    return(data.frame(
      timestamp = character(),
      rps = numeric()
    ))
  }

  data <- read_csv(
    live_csv_path,
    show_col_types = FALSE,
    progress = FALSE
  )

  if (!all(c("timestamp", "rps") %in% names(data))) {
    return(data.frame(timestamp = character(), rps = numeric()))
  }

  data <- data[!is.na(data$timestamp) & !is.na(data$rps), ]

  data$time <- as.POSIXct(
    data$timestamp,
    format = "%Y-%m-%dT%H:%M:%OS",
    tz = "UTC"
  )

  data <- data[!is.na(data$time), ]
  data
}

read_benchmark_summary <- function() {
  if (!file.exists(bench_summary_path)) {
    return(data.frame())
  }
  tryCatch({
    df <- read_csv(bench_summary_path, show_col_types = FALSE, progress = FALSE)
    as.data.frame(df)
  }, error = function(e) {
    data.frame()
  })
}

read_benchmark_requests <- function() {
  if (!file.exists(bench_requests_path)) {
    return(data.frame())
  }
  tryCatch({
    df <- read_csv(bench_requests_path, show_col_types = FALSE, progress = FALSE)
    as.data.frame(df)
  }, error = function(e) {
    data.frame()
  })
}

enrich_summary_with_request_window <- function(df_sum, df_req) {
  if (nrow(df_sum) == 0) {
    return(df_sum)
  }
  df_sum$traffic_window_rps <- NA_real_
  if (nrow(df_req) > 0 && all(c("run_id", "timestamp", "response_time_ms") %in% names(df_req))) {
    for (i in seq_len(nrow(df_sum))) {
      rid <- df_sum$run_id[i]
      sub_r <- df_req[df_req$run_id == rid, , drop = FALSE]
      if (nrow(sub_r) >= 2) {
        t_vals <- as.POSIXct(sub_r$timestamp, format = "%Y-%m-%dT%H:%M:%OS", tz = "UTC")
        valid <- !is.na(t_vals)
        if (sum(valid) >= 2) {
          first_lat_s <- as.numeric(sub_r$response_time_ms[which(valid)[1]]) / 1000.0
          span_s <- as.numeric(difftime(max(t_vals[valid]), min(t_vals[valid]), units = "secs")) + first_lat_s
          if (span_s > 0) {
            df_sum$traffic_window_rps[i] <- round(nrow(sub_r) / span_s, 2)
          }
        }
      }
    }
  }
  df_sum
}

read_predictions_export <- function() {
  if (!file.exists(predictions_export_path)) {
    return(data.frame())
  }
  tryCatch({
    df <- read_csv(predictions_export_path, show_col_types = FALSE, progress = FALSE)
    if (!all(c("Forecast_For_Time", "Predicted_Workload", "Actual_Workload") %in% names(df))) {
      return(data.frame())
    }
    df$time <- as.POSIXct(df$Forecast_For_Time, tz = "UTC")
    df <- df[!is.na(df$time), ]
    df$Formula_Desired_Instances <- derive_instances(df$Predicted_Workload)
    df$Formula_Reactive_Instances <- derive_instances(df$Actual_Workload)
    as.data.frame(df)
  }, error = function(e) {
    data.frame()
  })
}

fetch_live_instances_snapshot <- function() {
  con <- tryCatch(url("http://localhost:5000/instances", open = "rb"), error = function(e) NULL)
  if (is.null(con)) {
    return("Live Control Plane (:5000/instances) unreachable — start FastAPI service to view live Docker instance count.")
  }
  on.exit(try(close(con), silent = TRUE))
  raw <- tryCatch(paste(readLines(con, warn = FALSE), collapse = " "), error = function(e) "")
  if (!nzchar(raw)) {
    return("Live Control Plane (:5000/instances) returned an empty response.")
  }
  paste("Live /instances snapshot (point-in-time):", raw)
}

ui <- fluidPage(
  titlePanel("EcoRoute AI — R Analytics & Performance Evaluation"),

  tabsetPanel(
    id = "main_tabs",

    # ---------------- TAB 1: LIVE MONITORING (PRESERVED) ----------------
    tabPanel(
      "1. Live Monitoring",
      br(),
      h4("Live request traffic"),
      textOutput("latest_rps"),
      plotOutput("rps_plot", height = "350px"),
      h4("Request rate distribution"),
      plotOutput("distribution_plot", height = "300px")
    ),

    # ---------------- TAB 2: ALGORITHM COMPARISON ----------------
    tabPanel(
      "2. Algorithm Comparison",
      br(),
      h4("Fixed-Capacity Load-Balancing Benchmark (2 Active Backends)"),
      uiOutput("benchmark_content")
    ),

    # ---------------- TAB 3: PREDICTIVE AUTOSCALING ----------------
    tabPanel(
      "3. Predictive Autoscaling",
      br(),
      h4("Section A: Live Control Plane Snapshot & Recorded Live RPS (Measured)"),
      wellPanel(
        p(strong("Data Provenance:")),
        tags$ul(
          tags$li(strong("Measured Live RPS:"), " control-plane-brain/data/gold/live_rps_with_intervals.csv."),
          tags$li(strong("Live Instance Snapshot:"), " Point-in-time response from GET http://localhost:5000/instances."),
          tags$li(strong("Unavailable Live Metric:"), " Historical live Docker instance counts and live predictions are not persisted to disk.")
        ),
        verbatimTextOutput("live_instances_status")
      ),
      plotOutput("live_autoscaling_rps_plot", height = "260px"),
      hr(),
      h4("Section B: Offline Model Test-Set Evaluation & Formula-Derived Instance Counts (predictions_export.csv)"),
      wellPanel(
        p(
          strong("Source: "),
          code("control-plane-brain/data/gold/predictions_export.csv"),
          " (1,725 held-out test intervals). Instance counts are ",
          strong("formula-derived target instances"),
          " via ",
          code("clamp(ceiling(RPS / 187.5), 2, 10)"),
          "."
        ),
        sliderInput(
          "eval_window",
          "Select test-set interval range (rows):",
          min = 1,
          max = 1725,
          value = c(1, 300),
          step = 25,
          width = "100%"
        )
      ),
      plotOutput("pred_vs_actual_plot", height = "320px"),
      plotOutput("formula_instances_plot", height = "280px")
    )
  )
)

server <- function(input, output, session) {

  # ---------------- TAB 1 REACTIVES & OUTPUTS (UNCHANGED BEHAVIOR) ----------------
  live_data <- reactivePoll(
    5000,
    session,
    checkFunc = function() {
      if (file.exists(live_csv_path)) {
        file.info(live_csv_path)$mtime
      } else {
        NA
      }
    },
    valueFunc = read_live_data
  )

  output$latest_rps <- renderText({
    data <- live_data()

    if (nrow(data) == 0) {
      return("No valid data yet. Start the EcoRoute AI collector.")
    }

    paste("Latest recorded RPS:", tail(data$rps, 1))
  })

  output$rps_plot <- renderPlot({
    data <- live_data()

    validate(need(nrow(data) > 0, "Waiting for CSV data..."))

    ggplot(data, aes(x = time, y = rps)) +
      geom_line(linewidth = 0.8, na.rm = TRUE) +
      labs(
        title = "Requests per second over time",
        x = "Time (UTC)",
        y = "RPS"
      ) +
      theme_minimal()
  })

  output$distribution_plot <- renderPlot({
    data <- live_data()

    validate(need(nrow(data) > 0, "Waiting for CSV data..."))

    ggplot(data, aes(x = rps)) +
      geom_histogram(bins = 25, na.rm = TRUE) +
      labs(
        title = "Distribution of request rates",
        x = "RPS",
        y = "Number of observations"
      ) +
      theme_minimal()
  })

  # ---------------- TAB 2 REACTIVES & OUTPUTS ----------------
  bench_summary <- reactivePoll(
    5000,
    session,
    checkFunc = function() {
      if (file.exists(bench_summary_path)) {
        file.info(bench_summary_path)$mtime
      } else {
        NA
      }
    },
    valueFunc = read_benchmark_summary
  )

  bench_requests <- reactivePoll(
    5000,
    session,
    checkFunc = function() {
      if (file.exists(bench_requests_path)) {
        file.info(bench_requests_path)$mtime
      } else {
        NA
      }
    },
    valueFunc = read_benchmark_requests
  )

  output$benchmark_content <- renderUI({
    df_sum <- bench_summary()

    if (nrow(df_sum) == 0) {
      return(
        wellPanel(
          h4("No Benchmark Results Found (Empty State)"),
          p(
            "No benchmark CSV exists yet at ",
            code("control-plane-brain/data/gold/benchmark_summary.csv"),
            "."
          ),
          p("Run in PowerShell:"),
          pre("Set-Location C:\\Users\\yohar\\OneDrive\\Desktop\\EcoRouteAI\\EcoRoute-AI\\control-plane-brain\n.\\.venv\\Scripts\\python.exe run_benchmark.py --rps 25 --duration 30")
        )
      )
    }

    tagList(
      wellPanel(
        p(strong("Measurement Notes & Limitations:")),
        tags$ul(
          tags$li(
            strong("Window Definitions:"),
            " ", code("traffic_window_rps"), " (~25.0 RPS) divides completed requests (750) by the active request timestamp span (~30.0s in ",
            code("benchmark_requests.csv"), "). ",
            code("achieved_rps"), " (~23.04 RPS in the initial run) divided 750 by the outer client polling window (~32.55s, which included ~2.05s HTTP connection setup and 0.5s status-polling delay)."
          ),
          tags$li(
            strong("Failure Attribution & Unavailable Metrics:"),
            " Gateway only logs successful responses to Redis ", code("response_times"),
            "; any failed requests are recorded in ", code("unattributed_failures"),
            ". Container CPU/RAM metrics are not collected."
          )
        )
      ),
      h5("Measured Benchmark Summary Table"),
      tableOutput("bench_table"),
      fluidRow(
        column(6, plotOutput("bench_rps_plot", height = "320px")),
        column(6, plotOutput("bench_backend_split_plot", height = "320px"))
      ),
      br(),
      plotOutput("bench_latency_plot", height = "340px")
    )
  })

  output$bench_table <- renderTable({
    df <- enrich_summary_with_request_window(bench_summary(), bench_requests())
    req(nrow(df) > 0)

    cols <- c(
      "run_id",
      "verified_algorithm",
      "capacity_verified",
      "target_rps",
      "traffic_window_rps",
      "achieved_rps",
      "successful_requests",
      "failed_requests",
      "unattributed_failures",
      "mean_latency_ms",
      "median_latency_ms",
      "p95_latency_ms",
      "backend_5001_requests",
      "backend_5002_requests"
    )
    existing_cols <- intersect(cols, names(df))
    df[, existing_cols, drop = FALSE]
  })

  output$bench_rps_plot <- renderPlot({
    df <- enrich_summary_with_request_window(bench_summary(), bench_requests())
    validate(need(nrow(df) > 0, "No benchmark summary data."))

    df$verified_algorithm <- factor(df$verified_algorithm, levels = unique(df$verified_algorithm))
    df$plot_rps <- ifelse(!is.na(df$traffic_window_rps), df$traffic_window_rps, df$achieved_rps)

    ggplot(df, aes(x = verified_algorithm, y = plot_rps)) +
      geom_col(fill = "#3b82f6", width = 0.6) +
      geom_hline(aes(yintercept = target_rps), linetype = "dashed", color = "#ef4444", linewidth = 0.8) +
      labs(
        title = "Active-Window Achieved Throughput vs Target RPS (Dashed Red)",
        x = "Verified Algorithm",
        y = "Throughput (req / s)"
      ) +
      theme_minimal() +
      theme(axis.text.x = element_text(angle = 25, hjust = 1))
  })

  output$bench_backend_split_plot <- renderPlot({
    df <- bench_summary()
    validate(need(nrow(df) > 0, "No benchmark summary data."))

    df_5001 <- data.frame(
      algorithm = df$verified_algorithm,
      backend = "http://localhost:5001 (weight=5)",
      requests = df$backend_5001_requests
    )
    df_5002 <- data.frame(
      algorithm = df$verified_algorithm,
      backend = "http://localhost:5002 (weight=3)",
      requests = df$backend_5002_requests
    )
    split_df <- rbind(df_5001, df_5002)
    split_df$algorithm <- factor(split_df$algorithm, levels = unique(df$verified_algorithm))

    ggplot(split_df, aes(x = algorithm, y = requests, fill = backend)) +
      geom_col(position = "dodge", width = 0.65) +
      scale_fill_manual(values = c("#10b981", "#8b5cf6")) +
      labs(
        title = "Measured Per-Backend Request Counts (:5001 vs :5002)",
        x = "Verified Algorithm",
        y = "Measured Successful Requests",
        fill = "Backend Instance"
      ) +
      theme_minimal() +
      theme(axis.text.x = element_text(angle = 25, hjust = 1), legend.position = "top")
  })

  output$bench_latency_plot <- renderPlot({
    req_df <- bench_requests()
    sum_df <- bench_summary()
    validate(need(nrow(sum_df) > 0, "No benchmark latency data."))

    if (nrow(req_df) > 0 && all(c("algorithm", "response_time_ms") %in% names(req_df))) {
      req_df <- req_df[!is.na(req_df$response_time_ms), ]
      validate(need(nrow(req_df) > 0, "No valid measured responses in benchmark_requests.csv."))
      req_df$algorithm <- factor(req_df$algorithm, levels = unique(sum_df$verified_algorithm))

      ggplot(req_df, aes(x = algorithm, y = response_time_ms, fill = algorithm)) +
        geom_boxplot(outlier.alpha = 0.25, show.legend = FALSE) +
        labs(
          title = "Per-Request Response Latency Distribution by Algorithm (Measured in Redis)",
          x = "Verified Algorithm",
          y = "Response Time (ms)"
        ) +
        theme_minimal() +
        theme(axis.text.x = element_text(angle = 20, hjust = 1))
    } else {
      sum_df <- sum_df[!is.na(sum_df$mean_latency_ms), ]
      validate(need(nrow(sum_df) > 0, "No valid measured latencies."))
      sum_df$verified_algorithm <- factor(sum_df$verified_algorithm, levels = unique(sum_df$verified_algorithm))

      ggplot(sum_df, aes(x = verified_algorithm, y = mean_latency_ms)) +
        geom_col(fill = "#f59e0b", width = 0.6) +
        labs(
          title = "Mean Response Latency by Algorithm (ms)",
          x = "Verified Algorithm",
          y = "Mean Latency (ms)"
        ) +
        theme_minimal()
    }
  })

  # ---------------- TAB 3 REACTIVES & OUTPUTS ----------------
  output$live_instances_status <- renderText({
    invalidateLater(5000, session)
    fetch_live_instances_snapshot()
  })

  output$live_autoscaling_rps_plot <- renderPlot({
    data <- live_data()
    validate(need(nrow(data) > 0, "No live RPS CSV data available."))

    ggplot(data, aes(x = time, y = rps)) +
      geom_line(color = "#2563eb", linewidth = 0.8, na.rm = TRUE) +
      labs(
        title = "Measured Live RPS History (live_rps_with_intervals.csv)",
        subtitle = "Historical live predictions and Docker instance counts are not persisted to disk by main.py",
        x = "Time (UTC)",
        y = "Measured Live RPS"
      ) +
      theme_minimal()
  })

  pred_export_data <- reactive({
    read_predictions_export()
  })

  output$pred_vs_actual_plot <- renderPlot({
    df <- pred_export_data()
    validate(need(nrow(df) > 0, "predictions_export.csv not found or empty."))

    rng <- input$eval_window
    idx_start <- max(1, min(nrow(df), rng[1]))
    idx_end <- max(idx_start, min(nrow(df), rng[2]))
    sub_df <- df[idx_start:idx_end, , drop = FALSE]

    plot_df <- rbind(
      data.frame(
        time = sub_df$time,
        rps = sub_df$Actual_Workload,
        series = "Actual RPS (Test Set)"
      ),
      data.frame(
        time = sub_df$time,
        rps = sub_df$Predicted_Workload,
        series = "Predicted RPS (15-Min Ahead Model Forecast)"
      )
    )

    ggplot(plot_df, aes(x = time, y = rps, color = series, linetype = series)) +
      geom_line(linewidth = 0.85, na.rm = TRUE) +
      scale_color_manual(values = c("Actual RPS (Test Set)" = "#10b981", "Predicted RPS (15-Min Ahead Model Forecast)" = "#f59e0b")) +
      labs(
        title = "Offline Model Test-Set Evaluation: Actual vs 15-Minute Predicted RPS",
        subtitle = "Source: control-plane-brain/data/gold/predictions_export.csv (Held-out Test Split)",
        x = "Forecast Target Time (UTC)",
        y = "Workload (RPS)",
        color = "Series",
        linetype = "Series"
      ) +
      theme_minimal() +
      theme(legend.position = "top")
  })

  output$formula_instances_plot <- renderPlot({
    df <- pred_export_data()
    validate(need(nrow(df) > 0, "predictions_export.csv not found or empty."))

    rng <- input$eval_window
    idx_start <- max(1, min(nrow(df), rng[1]))
    idx_end <- max(idx_start, min(nrow(df), rng[2]))
    sub_df <- df[idx_start:idx_end, , drop = FALSE]

    inst_df <- rbind(
      data.frame(
        time = sub_df$time,
        instances = sub_df$Formula_Desired_Instances,
        series = "Proactive Desired Instances (from Predicted RPS)"
      ),
      data.frame(
        time = sub_df$time,
        instances = sub_df$Formula_Reactive_Instances,
        series = "Reactive Required Instances (from Actual RPS)"
      )
    )

    ggplot(inst_df, aes(x = time, y = instances, color = series)) +
      geom_step(linewidth = 0.9, na.rm = TRUE) +
      scale_color_manual(values = c(
        "Proactive Desired Instances (from Predicted RPS)" = "#f59e0b",
        "Reactive Required Instances (from Actual RPS)" = "#3b82f6"
      )) +
      scale_y_continuous(breaks = seq(MIN_INSTANCES, MAX_INSTANCES, by = 1), limits = c(1, MAX_INSTANCES + 1)) +
      labs(
        title = "Formula-Derived Target Backend Instances (Illustrative Rule Evaluation)",
        subtitle = "Derived via clamp(ceiling(RPS / 187.5), 2, 10) on predictions_export.csv — Not historical live Docker counts",
        x = "Forecast Target Time (UTC)",
        y = "Target Instances (2-10)",
        color = "Scaling Rule"
      ) +
      theme_minimal() +
      theme(legend.position = "top")
  })
}

shinyApp(ui, server)
