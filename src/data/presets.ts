export interface PresetCode {
  id: string;
  name: string;
  description: string;
  badge: string;
  code: string;
}

export const C_PRESETS: PresetCode[] = [
  {
    id: 'default-processor',
    name: 'Dynamic Buffer & Filter (Default)',
    description: 'C function with dynamic heap allocation, for loop, and if condition with memory bounds check.',
    badge: 'Standard C99',
    code: `#include <stdio.h>
#include <stdlib.h>

/**
 * Filter and compute prefix sums of positive values.
 * Demonstrates heap allocation, for-loop iteration,
 * and conditional safety branches.
 */
int process_sensor_stream(int *input_values, int count) {
    if (count <= 0) {
        return -1;
    }

    // Allocate dynamic heap buffer for filtered elements
    int *filtered_buffer = (int *)malloc(count * sizeof(int));
    if (filtered_buffer == NULL) {
        fprintf(stderr, "Error: Memory allocation failed.\\n");
        return -1;
    }

    int valid_samples = 0;
    int accumulator = 0;

    // Iterative processing loop
    for (int i = 0; i < count; i++) {
        // Evaluate threshold condition
        if (input_values[i] > 0) {
            filtered_buffer[valid_samples] = input_values[i];
            accumulator += filtered_buffer[valid_samples];
            valid_samples++;
        } else {
            // Signal anomaly or skip negative calibration noise
            printf("Notice: Skipped negative reading at index %d\\n", i);
        }
    }

    printf("Processed %d valid sensor samples. Sum = %d\\n", valid_samples, accumulator);

    // Properly deallocate heap memory
    free(filtered_buffer);
    filtered_buffer = NULL;

    return accumulator;
}

int main(void) {
    int raw_readings[8] = { 12, -4, 45, 0, 89, -15, 60, 23 };
    int result = process_sensor_stream(raw_readings, 8);
    printf("Final processed metric: %d\\n", result);
    return 0;
}
`
  },
  {
    id: 'memory-leak-vulnerabilities',
    name: 'Memory Leak & Buffer Safety Hazards',
    description: 'Demonstrates common C traps: missing free(), unchecked malloc(), unsafe strcpy, and loop invariant strlen.',
    badge: 'Vulnerability Demo',
    code: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void analyze_packet_payload(const char *raw_packet) {
    // RISK 1: Unchecked malloc (missing NULL pointer guard)
    char *packet_cache = (char *)malloc(128 * sizeof(char));

    // RISK 2: Unsafe unbounded string copy (CWE-120)
    strcpy(packet_cache, raw_packet);

    // RISK 3: O(N^2) loop invariant recalculation of strlen()
    int checksum = 0;
    for (int i = 0; i < strlen(packet_cache); i++) {
        // OPTIMIZATION: modulo vs bitwise parity check
        if (packet_cache[i] % 2 == 0) {
            checksum += (int)packet_cache[i];
        }
    }

    printf("Computed packet checksum: %d\\n", checksum);

    // CRITICAL RISK 4: packet_cache is never freed! (Memory Leak CWE-401)
    // free(packet_cache); <-- Missing cleanup
}

int main(void) {
    analyze_packet_payload("SYN_ACK_PAYLOAD_DATA_2026");
    return 0;
}
`
  },
  {
    id: 'off-by-one-and-bounds',
    name: 'Array Bounds & Off-by-One Risk',
    description: 'Shows off-by-one errors in loop boundaries and static buffer overflows.',
    badge: 'Off-by-One',
    code: `#include <stdio.h>

#define BUFFER_CAPACITY 10

void populate_lookup_table(void) {
    int cache_entries[BUFFER_CAPACITY];

    // Off-by-one risk: iterates i <= 10, accessing cache_entries[10] out of bounds
    for (int i = 0; i <= BUFFER_CAPACITY; i++) {
        if (i < 5) {
            cache_entries[i] = i * 2;
        } else {
            cache_entries[i] = i * 10;
        }
    }

    printf("Table populated successfully.\\n");
}

int main(void) {
    populate_lookup_table();
    return 0;
}
`
  },
  {
    id: 'safe-matrix-alloc',
    name: 'High-Performance 2D Dynamic Matrix',
    description: 'Clean C99 dynamic memory pattern with nested loops, boundary guards, and complete cleanup.',
    badge: 'Score 100% (A+)',
    code: `#include <stdio.h>
#include <stdlib.h>

int allocate_and_invert_matrix(int rows, int cols) {
    if (rows <= 0 || cols <= 0) {
        return -1;
    }

    // Allocate row pointer array
    int **matrix = (int **)malloc(rows * sizeof(int *));
    if (matrix == NULL) {
        return -1;
    }

    // Allocate columns for each row
    for (int r = 0; r < rows; r++) {
        matrix[r] = (int *)malloc(cols * sizeof(int));
        if (matrix[r] == NULL) {
            // Unwind previously allocated rows on failure
            for (int k = 0; k < r; k++) {
                free(matrix[k]);
            }
            free(matrix);
            return -1;
        }
    }

    // Populate and compute
    int sum = 0;
    for (int i = 0; i < rows; i++) {
        for (int j = 0; j < cols; j++) {
            if ((i + j) % 2 == 0) {
                matrix[i][j] = (i * cols) + j;
                sum += matrix[i][j];
            } else {
                matrix[i][j] = 0;
            }
        }
    }

    // Complete cleanup to prevent memory leaks
    for (int r = 0; r < rows; r++) {
        free(matrix[r]);
    }
    free(matrix);
    matrix = NULL;

    return sum;
}

int main(void) {
    int total = allocate_and_invert_matrix(4, 4);
    printf("Matrix computation sum: %d\\n", total);
    return 0;
}
`
  },
  {
    id: 'uninitialized-and-null',
    name: 'Uninitialized Variable & Use-After-Free',
    description: 'Highlights accessing pointers after free() and reading uninitialized local variables.',
    badge: 'Critical Bug',
    code: `#include <stdio.h>
#include <stdlib.h>

void execute_transaction(int amount) {
    // Issue: uninitialized status flag
    int transaction_status;

    // Reading uninitialized stack garbage
    if (transaction_status == 1) {
        printf("Transaction pre-approved!\\n");
    }

    int *account_balance = (int *)malloc(sizeof(int));
    if (account_balance != NULL) {
        *account_balance = amount + 500;
        printf("New Balance: %d\\n", *account_balance);

        free(account_balance);

        // Critical: Use-After-Free (CWE-416)
        *account_balance = 0;
    }
}

int main(void) {
    execute_transaction(150);
    return 0;
}
`
  }
];
