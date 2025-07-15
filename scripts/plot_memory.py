#!/usr/bin/env python3
"""
plot_memory.py - Visualize JVM heap memory usage over time

Usage:
    python plot_memory.py prom_jvm_memory_used_bytes.tsv [-o output.png] [--unit bytes|mb]

The input file must be a two-column TSV with the format:
    <ISO8601 timestamp> <value_in_bytes>

Example line:
    2025-07-09T19:04:48.582697 303579784

Dependencies:
    pip install pandas matplotlib python-dateutil
"""
import argparse
import os
import sys
from typing import Optional

import pandas as pd
import matplotlib.pyplot as plt

BYTES_IN_MB = 1024 * 1024

def load_tsv(path: str) -> pd.DataFrame:
    """Load TSV file into DataFrame with timestamp parsing."""
    # pandas read_csv with regex separator to handle variable whitespace
    df = pd.read_csv(path, sep=r"\s+", names=["timestamp", "bytes"], engine="python")
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    # drop any malformed rows
    df = df.dropna(subset=["timestamp", "bytes"])
    return df

def plot_memory(df: pd.DataFrame, unit: str = "mb", output: Optional[str] = None) -> None:
    """Plot the memory usage.

    Args:
        df: DataFrame with `timestamp` and `bytes` columns.
        unit: 'bytes' or 'mb' for y-axis unit.
        output: optional path to save the figure.
    """
    if unit == "mb":
        df["value"] = df["bytes"] / BYTES_IN_MB
        ylabel = "Heap Used (MB)"
    else:
        df["value"] = df["bytes"]
        ylabel = "Heap Used (bytes)"

    plt.figure(figsize=(12, 6))
    plt.plot(df["timestamp"], df["value"], label="heap used", color="#1976d2")
    plt.xlabel("Time")
    plt.ylabel(ylabel)
    plt.title("JVM Heap Memory Used Over Time")
    plt.grid(True, linestyle="--", alpha=0.5)
    plt.tight_layout()

    if output:
        plt.savefig(output, dpi=150)
        print(f"✅ Plot saved to {output}")
    else:
        plt.show()


def main():
    parser = argparse.ArgumentParser(description="Plot JVM heap memory usage from TSV data file.")
    parser.add_argument("input_file", help="Path to prom_jvm_memory_used_bytes.tsv")
    parser.add_argument("-o", "--output", help="Optional output PNG file path")
    parser.add_argument("--unit", choices=["bytes", "mb"], default="mb", help="Y-axis unit (default: mb)")
    args = parser.parse_args()

    if not os.path.isfile(args.input_file):
        print(f"❌ File not found: {args.input_file}", file=sys.stderr)
        sys.exit(1)

    df = load_tsv(args.input_file)
    if df.empty:
        print("❌ No valid data found in the input file.", file=sys.stderr)
        sys.exit(1)

    plot_memory(df, unit=args.unit, output=args.output)


if __name__ == "__main__":
    main() 