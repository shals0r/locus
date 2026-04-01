"""Entry point for `python -m locus_agent`."""

import argparse
import sys


def main() -> None:
    """Parse arguments and dispatch to CLI commands."""
    parser = argparse.ArgumentParser(
        prog="locus-agent",
        description="Locus Agent - Host-side process for Locus control plane",
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # start
    start_parser = subparsers.add_parser("start", help="Start the agent")
    start_parser.add_argument(
        "--daemon", "-d",
        action="store_true",
        help="Run in background (daemon mode)",
    )

    # stop
    subparsers.add_parser("stop", help="Stop the running agent")

    # status
    subparsers.add_parser("status", help="Check agent status")

    # logs
    subparsers.add_parser("logs", help="Show recent agent logs")

    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        sys.exit(1)

    from locus_agent.cli import cmd_start, cmd_stop, cmd_status, cmd_logs

    if args.command == "start":
        cmd_start(daemon=args.daemon)
    elif args.command == "stop":
        cmd_stop()
    elif args.command == "status":
        cmd_status()
    elif args.command == "logs":
        cmd_logs()


if __name__ == "__main__":
    main()
