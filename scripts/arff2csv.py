import argparse

if __name__ == "__main__":
    argparser = argparse.ArgumentParser(description="Generate data with constant error rate")
    argparser.add_argument("-i", help="name of the input file", type=str)
    argparser.add_argument("-o", help="name of the output file", type=str)

    args = argparser.parse_args()

    fname_in = args.i
    fname_out = args.o

    # read the first lines to get a list of attributes
    with open(fname_in, "r") as fin:
        with open(fname_out, "w") as fout:
            attributes = []
            is_reading_data = False
            for line in fin.xreadlines():
                if not is_reading_data:
                    if line.startswith("@ATTRIBUTE"):
                        attr_name = line.split(" ")[1].strip()
                        attributes.append(attr_name)
                    elif line.startswith("@DATA"):
                        is_reading_data = True
                        # write the attributes
                        fout.write(",".join(attributes))
                else:
                    fout.write("\n" + line.strip())
