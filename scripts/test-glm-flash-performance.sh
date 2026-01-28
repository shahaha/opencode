#!/bin/bash

# GLM-4.7-Flash Performance Test Suite
# Tests model performance across various usage scenarios

echo "🧪 GLM-4.7-Flash Performance Test Suite"
echo "======================================"

# Test configuration
MODEL="ollama/glm-4.7-flash"
TEST_TIMEOUT=30
RESULTS_FILE="glm-flash-test-results.json"

# Initialize results
echo '{"tests": [], "summary": {"total": 0, "passed": 0, "failed": 0}}' > "$RESULTS_FILE"

# Memory monitoring function
monitor_memory() {
    local test_name="$1"
    echo "📊 Monitoring memory for: $test_name"
    
    # Get initial memory
    local initial_mem=$(free -m | awk '/^Mem:/{print $7}')
    
    # Run test command
    local start_time=$(date +%s)
    timeout "$TEST_TIMEOUT" opencode --model "$MODEL" run "$2" > /dev/null 2>&1
    local exit_code=$?
    local end_time=$(date +%s)
    
    # Get final memory
    local final_mem=$(free -m | awk '/^Mem:/{print $7}')
    local memory_used=$((initial_mem - final_mem))
    local duration=$((end_time - start_time))
    
    # Record results
    local result=$(cat <<EOF
{
  "test": "$test_name",
  "status": $([ $exit_code -eq 0 ] && echo "true" || echo "false"),
  "duration": $duration,
  "memory_used_mb": $memory_used,
  "initial_memory_mb": $initial_mem,
  "final_memory_mb": $final_mem
}
EOF
)
    
    echo "✅ Test: $test_name - Status: $([ $exit_code -eq 0 ] && echo "PASSED" || echo "FAILED") - Duration: ${duration}s - Memory: ${memory_used}MB"
    
    # Return result for JSON processing
    echo "$result"
}

# Test scenarios
echo ""
echo "🎯 Running GLM-4.7-Flash Performance Tests..."
echo ""

# Test 1: Simple Query
echo "Test 1: Simple Query"
result1=$(monitor_memory "Simple Query" "Hello, how are you?")

# Test 2: Code Generation
echo "Test 2: Code Generation"
result2=$(monitor_memory "Code Generation" "Write a Python function to calculate fibonacci numbers")

# Test 3: Complex Reasoning
echo "Test 3: Complex Reasoning"
result3=$(monitor_memory "Complex Reasoning" "Explain the concept of recursion in programming and provide examples")

# Test 4: Tool Usage
echo "Test 4: Tool Usage"
result4=$(monitor_memory "Tool Usage" "List the files in the current directory and tell me what type of project this is")

# Test 5: Long Context
echo "Test 5: Long Context"
result5=$(monitor_memory "Long Context" "Analyze this codebase structure and suggest improvements for memory management in AI models")

# Compile results
echo ""
echo "📋 Test Results Summary:"
echo "======================="

# Count results
total_tests=5
passed_tests=0

# Check each test result
for result in "$result1" "$result2" "$result3" "$result4" "$result5"; do
    if echo "$result" | grep -q '"status": true'; then
        passed_tests=$((passed_tests + 1))
    fi
done

failed_tests=$((total_tests - passed_tests))

echo "Total Tests: $total_tests"
echo "Passed: $passed_tests"
echo "Failed: $failed_tests"
echo "Success Rate: $(( passed_tests * 100 / total_tests ))%"

# Memory analysis
echo ""
echo "💾 Memory Usage Analysis:"
echo "========================"

# Calculate average memory usage
total_memory=0
for result in "$result1" "$result2" "$result3" "$result4" "$result5"; do
    mem=$(echo "$result" | grep -o '"memory_used_mb": [0-9]*' | cut -d' ' -f2)
    total_memory=$((total_memory + mem))
done

avg_memory=$((total_memory / total_tests))
echo "Average Memory Used: ${avg_memory}MB"

# Performance recommendations
echo ""
echo "🎯 Performance Recommendations:"
echo "=============================="

if [ $passed_tests -eq $total_tests ]; then
    echo "✅ All tests passed - GLM-4.7-Flash is performing optimally"
else
    echo "⚠️  Some tests failed - investigate model configuration"
fi

if [ $avg_memory -lt 500 ]; then
    echo "✅ Memory usage is excellent (< 500MB average)"
elif [ $avg_memory -lt 1000 ]; then
    echo "✅ Memory usage is good (< 1GB average)"
else
    echo "⚠️  Memory usage is high (> 1GB average) - consider optimization"
fi

# Generate final JSON report
echo ""
echo "📄 Generating test report..."
cat > "$RESULTS_FILE" <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "model": "$MODEL",
  "tests": [
    $(echo "$result1" | sed 's/^{/  {/' | sed 's/}$/  },/'),
    $(echo "$result2" | sed 's/^{/  {/' | sed 's/}$/  },/'),
    $(echo "$result3" | sed 's/^{/  {/' | sed 's/}$/  },/'),
    $(echo "$result4" | sed 's/^{/  {/' | sed 's/}$/  },/'),
    $(echo "$result5" | sed 's/^{/  {/' | sed 's/}$/  }/')
  ],
  "summary": {
    "total": $total_tests,
    "passed": $passed_tests,
    "failed": $failed_tests,
    "success_rate": $(( passed_tests * 100 / total_tests )),
    "average_memory_mb": $avg_memory
  }
}
EOF

echo "✅ Test results saved to: $RESULTS_FILE"
echo ""
echo "🎉 GLM-4.7-Flash Performance Test Complete!"